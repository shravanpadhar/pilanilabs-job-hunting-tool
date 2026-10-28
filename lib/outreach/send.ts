import { outreach } from "@/config/outreach";
import { isBlockedCountry } from "@/config/regions";
import { audit } from "@/lib/audit";
import { clockNow } from "@/lib/clock";
import { optOutToken } from "@/lib/compliance/optout";
import { addSuppression, suppressedSet } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { attachmentPath, currentHash, sha256Hex } from "@/lib/outreach/approval";
import { decideSend, type SendSnapshot } from "@/lib/outreach/policy";
import { recipientZone } from "@/lib/outreach/preview";
import { startOfLocalDay } from "@/lib/outreach/time";
import { targetGate } from "@/lib/outreach/targets";
import { effectiveDailyCap, warmupStageFor } from "@/lib/outreach/warmup";
import { getMailbox } from "@/lib/providers/mailbox";
import { PermanentMailError, type MailboxProvider } from "@/lib/providers/mailbox/types";
import { getQueue } from "@/lib/providers/queue";
import { getFileBytes } from "@/lib/storage";

/**
 * The sender. It turns an APPROVED + SCHEDULED message into at most ONE real email:
 *
 *   1. refuse unless the stored approval hash still equals the hash of what we are about to send;
 *   2. claim the message atomically (SCHEDULED -> SENDING in one UPDATE): only one worker can win;
 *   3. re-run the whole send-time policy (reply, opt-out, caps, hours, pause...), releasing the claim if it says wait;
 *   4. send through the mailbox provider with a deterministic Message-ID and an X-Pilani-Send-Key header;
 *   5. record SENT. If anything fails AFTER the provider call, we ask the mailbox whether the mail went out before
 *      ever retrying, so a crash can never produce a duplicate.
 */
export type SendOutcome = { status: "sent" | "skipped" | "held" | "cancelled" | "failed" | "retry"; reason?: string };

const MAX_ATTEMPTS = 5;
const domainOf = (email: string) => email.split("@")[1] ?? "mail.invalid";
export const rfcMessageId = (sendKey: string, accountEmail: string) => `<${sendKey.slice(0, 40)}@${domainOf(accountEmail)}>`;

async function activeAccount(userId: string, _provider: MailboxProvider) {
  void _provider;
  return db.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE", provider: "GMAIL" }, // the fake mailbox also stores its accounts as GMAIL
    orderBy: { connectedAt: "asc" },
    select: { id: true, accountEmail: true, dailySendCap: true, connectedAt: true, warmupStage: true },
  });
}

async function release(messageId: string, until: Date, reason: string, attemptsKept = true) {
  await db.outreachMessage.updateMany({ where: { id: messageId, state: "SENDING" }, data: { state: "SCHEDULED", scheduledAt: until, claimedAt: null, lastError: reason, ...(attemptsKept ? {} : { attempts: 0 }) } });
}

export async function sendMessage(messageId: string, deps: { now?: Date; mailbox?: MailboxProvider } = {}): Promise<SendOutcome> {
  const now = deps.now ?? (await clockNow());
  const mailbox = deps.mailbox ?? getMailbox();

  const m = await db.outreachMessage.findUnique({ where: { id: messageId }, include: { target: { include: { campaign: true } } } });
  if (!m || m.channel !== "EMAIL") return { status: "skipped", reason: "not_an_email" };
  if (m.state !== "SCHEDULED" || !m.scheduledAt || m.scheduledAt > now) return { status: "skipped", reason: "not_due" };
  const userId = m.target.campaign.userId;

  // 1. The approval must still describe exactly what we are about to send.
  let composedHash: string;
  let composed;
  try {
    const c = await currentHash(m.id);
    composedHash = c.hash;
    composed = c.composed;
  } catch (err) {
    await release(m.id, new Date(now.getTime() + 3_600_000), `cannot_compose: ${(err as Error).message}`.slice(0, 200));
    return { status: "held", reason: "cannot_compose" };
  }
  if (!m.approvedTextHash || !m.sendKey || composedHash !== m.approvedTextHash) {
    await db.outreachMessage.updateMany({ where: { id: m.id, state: "SCHEDULED" }, data: { state: "FAILED", lastError: "approval_mismatch" } });
    await audit({ userId, action: "send.refused", entityType: "OutreachMessage", entityId: m.id, detail: { reason: "approval_mismatch" } });
    return { status: "failed", reason: "approval_mismatch" };
  }

  // 2. Atomic claim: exactly one concurrent caller gets count 1.
  const claim = await db.outreachMessage.updateMany({ where: { id: m.id, state: "SCHEDULED", scheduledAt: { lte: now } }, data: { state: "SENDING", claimedAt: now, attempts: { increment: 1 } } });
  if (claim.count !== 1) return { status: "skipped", reason: "claimed_elsewhere" };

  try {
    // 3. Policy, re-evaluated now.
    const account = await activeAccount(userId, mailbox);
    const profile = composed.profile;
    const candidateTz = profile?.timeZone ?? "Asia/Kolkata";
    const dayStart = startOfLocalDay(now, candidateTz);
    const [prev, replies, suppressed, others] = await Promise.all([
      m.step > 1 ? db.outreachMessage.findUnique({ where: { targetId_channel_step: { targetId: m.targetId, channel: "EMAIL", step: m.step - 1 } } }) : null,
      db.reply.count({ where: { message: { targetId: m.targetId } } }),
      m.target.email ? suppressedSet([m.target.email]) : new Set<string>(),
      db.outreachMessage.findMany({
        where: { id: { not: m.id }, channel: "EMAIL", target: { campaign: { userId } }, OR: [{ state: "SENT", sentAt: { gte: dayStart } }, { state: "SENDING", claimedAt: { gte: new Date(now.getTime() - outreach.staleClaimMinutes * 60_000) } }] },
        select: { state: true, sentAt: true, claimedAt: true },
      }),
    ]);
    const gate = targetGate({ email: m.target.email, emailVerification: m.target.emailVerification, confidence: m.target.confidence, country: m.target.country, riskAcknowledgedAt: m.target.riskAcknowledgedAt, suppressed: m.target.email ? suppressed.has(m.target.email) : false });
    const lastTimes = others.map((o) => (o.state === "SENT" ? o.sentAt : o.claimedAt)).filter((d): d is Date => d !== null);
    const snapshot: SendSnapshot = {
      now, message: { id: m.id, step: m.step }, campaignStatus: m.target.campaign.status, targetState: m.target.state, hasReply: replies > 0,
      suppressed: gate.hardBlocks.includes("SUPPRESSED"), targetSendable: gate.canProceed, regionBlocked: isBlockedCountry(m.target.country),
      recipientTz: recipientZone(m.target.country, candidateTz), sendingEnabled: env.outreachSendingEnabled, sendingPaused: Boolean(profile?.sendingPausedAt),
      mailboxActive: Boolean(account), sentToday: others.length, dailyCap: account ? effectiveDailyCap(account, now) : 0,
      lastMailboxSendAt: lastTimes.length ? new Date(Math.max(...lastTimes.map((d) => d.getTime()))) : null, candidateTz,
      prev: prev ? { state: prev.state, sentAt: prev.sentAt } : null,
    };
    const decision = decideSend(snapshot);
    if (decision.action === "cancel") {
      await db.outreachMessage.updateMany({ where: { id: m.id, state: "SENDING" }, data: { state: "CANCELLED", lastError: decision.reason, scheduledAt: null } });
      await audit({ userId, action: "send.cancelled", entityType: "OutreachMessage", entityId: m.id, detail: { reason: decision.reason } });
      return { status: "cancelled", reason: decision.reason };
    }
    if (decision.action === "hold") {
      await release(m.id, decision.until, decision.reason);
      return { status: "held", reason: decision.reason };
    }
    if (!account) throw new Error("unreachable: no mailbox"); // decideSend holds when there is none

    // Keep the stored warm-up stage in step with reality (shown in settings).
    const stage = warmupStageFor(account.connectedAt, now);
    if (stage !== account.warmupStage) await db.connectedAccount.update({ where: { id: account.id }, data: { warmupStage: stage } });

    // 4. Build and send.
    let attachments: Array<{ filename: string; contentType: string; bytes: Buffer }> = [];
    if (m.attachmentSha256) {
      const bytes = await getFileBytes(attachmentPath(userId, m.attachmentSha256));
      if (!bytes || sha256Hex(bytes) !== m.attachmentSha256) {
        await db.outreachMessage.updateMany({ where: { id: m.id, state: "SENDING" }, data: { state: "FAILED", lastError: "attachment_missing_or_changed" } });
        await audit({ userId, action: "send.refused", entityType: "OutreachMessage", entityId: m.id, detail: { reason: "attachment_mismatch" } });
        return { status: "failed", reason: "attachment_missing_or_changed" };
      }
      attachments = [{ filename: `${(profile?.senderName ?? "resume").replace(/[^A-Za-z0-9]+/g, "-")}-resume.pdf`, contentType: "application/pdf", bytes }];
    }
    const messageId = rfcMessageId(m.sendKey, account.accountEmail);
    const mail = {
      from: { name: profile!.senderName!, email: account.accountEmail }, to: composed.to, subject: composed.subject ?? "", text: composed.bodyAsSent, attachments, messageId,
      headers: { "List-Unsubscribe": `<${env.appUrl}/api/optout/${optOutToken(m.targetId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "X-Pilani-Send-Key": m.sendKey },
      threadId: prev?.threadId ?? null, inReplyTo: prev?.sendKey ? rfcMessageId(prev.sendKey, account.accountEmail) : null,
    };

    let sentRef: { providerMessageId: string; threadId: string } | null = null;
    try {
      sentRef = await mailbox.send(account.id, mail);
    } catch (err) {
      if (err instanceof PermanentMailError) return await failPermanent(m, userId, account.id, err);
      // Unknown outcome: the mail may or may not have left. Ask the mailbox BEFORE any retry.
      try {
        sentRef = await mailbox.findSent(account.id, { to: composed.to, sinceMs: now.getTime(), sendKey: m.sendKey, messageId });
      } catch {
        log.warn("send_state_unknown", { messageId: m.id });
        return { status: "retry", reason: "unknown_state" }; // stays SENDING; stale recovery resolves it
      }
      if (!sentRef) {
        const attempts = m.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await db.outreachMessage.updateMany({ where: { id: m.id, state: "SENDING" }, data: { state: "FAILED", lastError: `gave_up: ${(err as Error).message}`.slice(0, 200) } });
          await audit({ userId, action: "send.failed", entityType: "OutreachMessage", entityId: m.id, detail: { attempts } });
          return { status: "failed", reason: "max_attempts" };
        }
        await release(m.id, new Date(now.getTime() + attempts * 10 * 60_000), `transient: ${(err as Error).message}`.slice(0, 200));
        return { status: "retry", reason: "transient" };
      }
    }

    // 5. Record it.
    await markSent(m.id, userId, m.targetId, m.step, sentRef, now);
    return { status: "sent" };
  } catch (err) {
    // Something unexpected before the provider call: give the claim back so the next tick can retry.
    log.error("send_unexpected_error", err, { messageId: m.id });
    await release(m.id, new Date(now.getTime() + 15 * 60_000), `error: ${(err as Error).message}`.slice(0, 200));
    return { status: "retry", reason: "error" };
  }
}

async function markSent(messageId: string, userId: string, targetId: string, step: number, ref: { providerMessageId: string; threadId: string }, at: Date) {
  await db.outreachMessage.updateMany({ where: { id: messageId, state: "SENDING" }, data: { state: "SENT", sentAt: at, providerMessageId: ref.providerMessageId, threadId: ref.threadId, lastError: null } });
  await db.outreachTarget.updateMany({ where: { id: targetId, state: { in: ["APPROVED", "SCHEDULED", "DRAFTED", "VERIFIED"] } }, data: { state: "SENT" } });
  await audit({ userId, action: "message.sent", entityType: "OutreachMessage", entityId: messageId, detail: { step, provider: ref.providerMessageId.slice(0, 12) } }, { strict: true });
}

async function failPermanent(m: { id: string; targetId: string; target: { email: string | null } }, userId: string, accountId: string, err: PermanentMailError): Promise<SendOutcome> {
  if (err.code === "auth_revoked") {
    await db.connectedAccount.update({ where: { id: accountId }, data: { status: "ERROR", lastError: err.message.slice(0, 200) } });
    await release(m.id, new Date(Date.now() + 3_600_000), "mailbox_reconnect_needed");
    await audit({ userId, action: "mailbox.error", entityType: "ConnectedAccount", entityId: accountId, detail: { code: err.code } });
    return { status: "held", reason: "auth_revoked" };
  }
  await db.outreachMessage.updateMany({ where: { id: m.id, state: "SENDING" }, data: { state: "FAILED", lastError: err.code } });
  if (err.code === "invalid_recipient" && m.target.email) {
    // A hard bounce: never contact this address again, and stop the rest of the sequence.
    await addSuppression(m.target.email, "BOUNCE");
    await db.outreachTarget.update({ where: { id: m.targetId }, data: { state: "BOUNCED" } });
    await db.outreachMessage.updateMany({ where: { targetId: m.targetId, state: { in: ["DRAFT", "APPROVED", "SCHEDULED"] } }, data: { state: "CANCELLED", scheduledAt: null } });
  }
  await audit({ userId, action: "send.failed", entityType: "OutreachMessage", entityId: m.id, detail: { code: err.code } });
  return { status: "failed", reason: err.code };
}

/**
 * A claim older than staleClaimMinutes means a worker died mid-send. Ask the mailbox whether the email really left:
 * yes -> record it as SENT (never resend), no -> give it back to the queue.
 */
export async function recoverStaleClaims(now: Date, mailbox: MailboxProvider = getMailbox()): Promise<{ recovered: number; released: number }> {
  const stale = await db.outreachMessage.findMany({
    where: { state: "SENDING", claimedAt: { lt: new Date(now.getTime() - outreach.staleClaimMinutes * 60_000) } },
    include: { target: { include: { campaign: true } } },
    take: 100,
  });
  let recovered = 0;
  let released = 0;
  for (const m of stale) {
    const userId = m.target.campaign.userId;
    const account = await activeAccount(userId, mailbox);
    if (!account || !m.sendKey || !m.target.email) {
      await release(m.id, new Date(now.getTime() + 3_600_000), "stale_no_mailbox");
      released++;
      continue;
    }
    const found = await mailbox
      .findSent(account.id, { to: m.target.email, sinceMs: (m.claimedAt ?? now).getTime(), sendKey: m.sendKey, messageId: rfcMessageId(m.sendKey, account.accountEmail) })
      .catch(() => "unknown" as const);
    if (found === "unknown") continue; // cannot tell: leave it; never risk a duplicate
    if (found) {
      await markSent(m.id, userId, m.targetId, m.step, found, m.claimedAt ?? now);
      recovered++;
    } else {
      await release(m.id, now, "stale_not_sent");
      released++;
    }
  }
  return { recovered, released };
}

/** The 5-minute tick: recover orphaned sends, then enqueue one send event per due message (the queue retries safely). */
export async function dispatchDueMessages(now?: Date): Promise<{ recovered: number; dispatched: number }> {
  const at = now ?? (await clockNow());
  const { recovered } = await recoverStaleClaims(at);
  const due = await db.outreachMessage.findMany({
    where: { state: "SCHEDULED", channel: "EMAIL", scheduledAt: { lte: at }, target: { campaign: { status: { in: ["ACTIVE", "PAUSED"] } } } },
    orderBy: { scheduledAt: "asc" },
    take: 200,
    select: { id: true, attempts: true, scheduledAt: true },
  });
  const queue = getQueue();
  for (const m of due) await queue.send("outreach/send.requested", { messageId: m.id }, { id: `send:${m.id}:${m.attempts}:${m.scheduledAt?.getTime()}` });
  return { recovered, dispatched: due.length };
}
