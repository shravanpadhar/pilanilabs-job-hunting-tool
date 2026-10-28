import type { LinkedInState, TargetState } from "@/generated/prisma/enums";
import { outreach } from "@/config/outreach";
import { audit } from "@/lib/audit";
import { clockNow } from "@/lib/clock";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { log } from "@/lib/logger";
import { generateDraftSet, loadVerifyContext } from "@/lib/outreach/draft";
import { getNotifier } from "@/lib/providers/notify";
import { assertAiQuota } from "@/lib/rate-limit";

/**
 * LinkedIn, ASSISTED mode only (spec decision 1, option A). This module never talks to LinkedIn: no API client, no bot, no
 * browser automation, no scraping. The product finds the person, writes the note (max 300 characters), opens the profile for
 * the candidate, tracks the 14-day wait, reminds them, and drafts the message for after acceptance. THE CANDIDATE clicks Send
 * in LinkedIn and tells us what happened. Because we cannot observe LinkedIn, only the candidate can mark "accepted"; the
 * system itself only ever records an expiry (D-18).
 */
export type LinkedInEvent = "request_sent" | "accepted" | "message_sent" | "withdraw";

const TRANSITIONS: Record<LinkedInState, Partial<Record<LinkedInEvent, LinkedInState>>> = {
  NOT_STARTED: { request_sent: "CONNECT_PENDING", withdraw: "WITHDRAWN" },
  CONNECT_PENDING: { accepted: "ACCEPTED", withdraw: "WITHDRAWN" },
  ACCEPTED: { message_sent: "MESSAGED", withdraw: "WITHDRAWN" },
  MESSAGED: {},
  WITHDRAWN: {},
};

/** Pure transition table: throws on anything not allowed (for example messaging before the request was accepted). */
export function nextLinkedInState(from: LinkedInState, event: LinkedInEvent): LinkedInState {
  const to = TRANSITIONS[from][event];
  if (!to) throw new AppError(describeIllegal(from, event), 409, "illegal_linkedin_transition");
  return to;
}

function describeIllegal(from: LinkedInState, event: LinkedInEvent): string {
  if (from === "WITHDRAWN") return "This connection request was withdrawn, so we will not message this person.";
  if (from === "MESSAGED") return "You have already messaged this person.";
  if (event === "message_sent" && from !== "ACCEPTED") return "Only message this person after they accept your connection request.";
  if (event === "accepted" && from === "NOT_STARTED") return "Send the connection request first.";
  return "That step is not available right now.";
}

export const requestExpiry = (requestedAt: Date) => new Date(requestedAt.getTime() + outreach.linkedin.expiryDays * 86_400_000);

export type WaitStatus = "waiting" | "reminder_due" | "expired" | "auto_withdraw_due";

/** Where a pending connection request is in its 14-day life (pure). */
export function waitStatus(requestedAt: Date, now: Date): WaitStatus {
  const days = (now.getTime() - requestedAt.getTime()) / 86_400_000;
  if (days >= outreach.linkedin.expiryDays + outreach.linkedin.autoWithdrawGraceDays) return "auto_withdraw_due";
  if (days >= outreach.linkedin.expiryDays) return "expired";
  if (days >= outreach.linkedin.reminderDay) return "reminder_due";
  return "waiting";
}

const FROZEN: TargetState[] = ["REPLIED", "OPTED_OUT", "BOUNCED", "CANCELLED"];
const isFrozen = (state: string) => (FROZEN as string[]).includes(state);

async function load(userId: string, targetId: string) {
  const t = await db.outreachTarget.findFirst({ where: { id: targetId, campaign: { userId } }, include: { campaign: true, linkedin: true, messages: true } });
  if (!t) throw notFound("Contact");
  return t;
}

/** A reply, bounce or opt-out on the email lane pauses ALL further steps to that person, LinkedIn included (spec step 9). */
function assertNotFrozen(t: { state: string }) {
  if (isFrozen(t.state)) throw new AppError("This person has replied, opted out or could not be reached, so we have paused every further step to them, including on LinkedIn.", 409, "linkedin_frozen");
}

function messageOf(t: { messages: Array<{ channel: string; id: string; state: string; approvedTextHash: string | null }> }, channel: "LINKEDIN_NOTE" | "LINKEDIN_MESSAGE") {
  return t.messages.find((m) => m.channel === channel);
}

export async function applyLinkedInEvent(userId: string, targetId: string, event: LinkedInEvent) {
  const t = await load(userId, targetId);
  if (event !== "withdraw") assertNotFrozen(t);
  const step = t.linkedin ?? (await db.linkedInStep.create({ data: { targetId, state: "NOT_STARTED" } }));
  const to = nextLinkedInState(step.state, event);
  const now = await clockNow();

  // The text the candidate pastes into LinkedIn must be text they approved (the same approval record as email).
  if (event === "request_sent") {
    const note = messageOf(t, "LINKEDIN_NOTE");
    if (!note || note.state !== "APPROVED" || !note.approvedTextHash) throw new AppError("Approve your connection note first, then send it in LinkedIn and come back here.", 409, "not_approved");
  }
  if (event === "message_sent") {
    const msg = messageOf(t, "LINKEDIN_MESSAGE");
    if (!msg || msg.state !== "APPROVED" || !msg.approvedTextHash) throw new AppError("Approve your message first.", 409, "not_approved");
  }

  const data =
    event === "request_sent" ? { state: to, requestedAt: now, expiresAt: requestExpiry(now), markedBy: "USER" as const }
    : event === "accepted" ? { state: to, acceptedAt: now, markedBy: "USER" as const }
    : { state: to, markedBy: "USER" as const };
  const updated = await db.linkedInStep.update({ where: { id: step.id }, data });

  if (event === "request_sent") await db.outreachMessage.updateMany({ where: { targetId, channel: "LINKEDIN_NOTE", state: "APPROVED" }, data: { state: "SENT", sentAt: now } });
  if (event === "message_sent") await db.outreachMessage.updateMany({ where: { targetId, channel: "LINKEDIN_MESSAGE", state: "APPROVED" }, data: { state: "SENT", sentAt: now } });
  if (event === "withdraw") await db.outreachMessage.updateMany({ where: { targetId, channel: { in: ["LINKEDIN_NOTE", "LINKEDIN_MESSAGE"] }, state: { in: ["DRAFT", "APPROVED"] } }, data: { state: "CANCELLED" } });

  if (event === "accepted") await draftPostAcceptanceMessage(userId, t).catch((err) => log.warn("linkedin_message_draft_failed", { message: (err as Error).message }));
  await audit({ userId, action: `linkedin.${event}`, entityType: "OutreachTarget", entityId: targetId, detail: { from: step.state, to } });
  return updated;
}

/**
 * After the candidate says the request was accepted, draft the message to send then. It goes through the same writer and
 * verifier as every other draft (profile facts only, no invented connection) and still needs the candidate's approval.
 */
async function draftPostAcceptanceMessage(userId: string, t: Awaited<ReturnType<typeof load>>) {
  if (messageOf(t, "LINKEDIN_MESSAGE")) return;
  const profile = await db.outreachProfile.findUnique({ where: { userId }, select: { senderName: true } });
  await assertAiQuota(userId, "draft_outreach");
  const ctx = await loadVerifyContext(userId, t.campaign, t, profile?.senderName ?? "");
  const gen = await generateDraftSet(userId, ctx, t);
  await db.outreachMessage.upsert({
    where: { targetId_channel_step: { targetId: t.id, channel: "LINKEDIN_MESSAGE", step: 1 } },
    create: { targetId: t.id, channel: "LINKEDIN_MESSAGE", step: 1, body: gen.set.linkedinMessage, templateKey: gen.source === "model" ? "linkedin.message.v1" : "linkedin.message.fallback.v1", state: "DRAFT" },
    update: {},
  });
}

/** What the candidate can do right now, for the UI (never trusted from the browser). */
export function linkedinActions(step: { state: LinkedInState; requestedAt: Date | null } | null, targetState: string, now: Date) {
  const frozen = isFrozen(targetState);
  const state: LinkedInState = step?.state ?? "NOT_STARTED";
  const wait = state === "CONNECT_PENDING" && step?.requestedAt ? waitStatus(step.requestedAt, now) : null;
  return {
    state, frozen, wait,
    canSendRequest: !frozen && state === "NOT_STARTED",
    canMarkAccepted: !frozen && state === "CONNECT_PENDING" && wait !== "auto_withdraw_due",
    canMarkMessaged: !frozen && state === "ACCEPTED",
    canWithdraw: state === "NOT_STARTED" || state === "CONNECT_PENDING" || state === "ACCEPTED",
    shouldWithdraw: state === "CONNECT_PENDING" && (wait === "expired" || wait === "auto_withdraw_due"),
  };
}

const notify = async (userId: string, targetName: string, subject: string, text: string) => {
  const [profile, user] = await Promise.all([db.outreachProfile.findUnique({ where: { userId } }), db.user.findUnique({ where: { id: userId }, select: { email: true } })]);
  const body = `${text}\n\n${env.appUrl}/outreach`;
  await getNotifier().send({ to: { email: profile?.notifyEmail !== false ? (user?.email ?? null) : null, whatsapp: profile?.notifyWhatsapp ? profile.whatsappNumber : null }, subject, text: body, html: `<p>${body.replace(/\n/g, "<br/>")}</p>` });
  void targetName;
};

/**
 * Hourly: day-7 reminder, day-14 "withdraw it and do not message" prompt, and (after a grace period with no action) a
 * system-recorded WITHDRAWN. Each reminder is sent once (de-duplicated through the audit log). Paused (frozen) people are skipped.
 */
export async function runLinkedInReminders(now?: Date): Promise<{ reminders: number; expiryPrompts: number; autoWithdrawn: number }> {
  const at = now ?? (await clockNow());
  const pending = await db.linkedInStep.findMany({ where: { state: "CONNECT_PENDING", requestedAt: { not: null }, target: { state: { notIn: FROZEN }, campaign: { status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] } } } }, include: { target: { include: { campaign: { select: { userId: true } } } } }, take: 500 });
  const out = { reminders: 0, expiryPrompts: 0, autoWithdrawn: 0 };
  const once = async (userId: string, action: string, entityId: string) => (await db.auditEvent.count({ where: { userId, action, entityId } })) === 0;

  for (const s of pending) {
    const userId = s.target.campaign.userId;
    const status = waitStatus(s.requestedAt!, at);
    if (status === "reminder_due" && (await once(userId, "linkedin.reminder_day7", s.targetId))) {
      await notify(userId, s.target.fullName, `Still waiting on ${s.target.fullName} (LinkedIn)`, `Your LinkedIn request to ${s.target.fullName} has been pending for a week. Nothing to do yet: it will be cleaned up after ${outreach.linkedin.expiryDays} days.`);
      await audit({ userId, action: "linkedin.reminder_day7", entityType: "OutreachTarget", entityId: s.targetId });
      out.reminders++;
    }
    if ((status === "expired" || status === "auto_withdraw_due") && (await once(userId, "linkedin.expiry_prompt", s.targetId))) {
      await notify(userId, s.target.fullName, `Withdraw your LinkedIn request to ${s.target.fullName}`, `${s.target.fullName} did not accept in ${outreach.linkedin.expiryDays} days. Please withdraw the request in LinkedIn and do not message them.`);
      await audit({ userId, action: "linkedin.expiry_prompt", entityType: "OutreachTarget", entityId: s.targetId });
      out.expiryPrompts++;
    }
    if (status === "auto_withdraw_due") {
      await db.linkedInStep.update({ where: { id: s.id }, data: { state: "WITHDRAWN", markedBy: "SYSTEM" } });
      await db.outreachMessage.updateMany({ where: { targetId: s.targetId, channel: "LINKEDIN_MESSAGE", state: { in: ["DRAFT", "APPROVED"] } }, data: { state: "CANCELLED" } });
      await audit({ userId, action: "linkedin.auto_withdrawn", entityType: "OutreachTarget", entityId: s.targetId });
      out.autoWithdrawn++;
    }
  }
  return out;
}
