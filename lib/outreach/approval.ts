import { createHash } from "node:crypto";
import type { OutreachCampaign, OutreachMessage, OutreachProfile, OutreachTarget } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { composeEmailText, emailFooter } from "@/lib/compliance/optout";
import { suppressedSet } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { scheduleLateApproval } from "@/lib/outreach/activate";
import { loadVerifyContext, structureViolations } from "@/lib/outreach/draft";
import { requireCompleteProfile } from "@/lib/outreach/profile";
import { targetGate } from "@/lib/outreach/targets";
import { describeViolations, verifyMessage } from "@/lib/outreach/verify-message";
import { renderResumePdf } from "@/lib/resume/render-pdf";
import { resumeSchema } from "@/lib/resume/schema";
import { getFileBytes, putFile } from "@/lib/storage";

/**
 * Approval records (non-negotiable): nothing is ever sent without one. The record stores `approvedTextHash`, a SHA-256 of a
 * canonical form of EXACTLY what will be sent: channel, step, recipient, subject, the full body including the footer, and the
 * attachment's hash. Changing any of those after approval changes the hash, so the sender refuses and the candidate must approve again.
 */
export interface PayloadInput {
  channel: string;
  step: number;
  to: string;
  subject: string | null;
  body: string;
  attachmentSha256: string | null;
}

export function canonicalPayload(i: PayloadInput): string {
  // A JSON array has a fixed field order, so the same content always serialises to the same bytes.
  return JSON.stringify(["v1", i.channel, i.step, i.to.trim().toLowerCase(), i.subject ?? "", i.body, i.attachmentSha256 ?? ""]);
}
export const approvalHash = (i: PayloadInput) => createHash("sha256").update(canonicalPayload(i)).digest("hex");
export const sendKeyFor = (messageId: string, hash: string) => createHash("sha256").update(`${messageId}|${hash}`).digest("hex");
export const sha256Hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Content-addressed location of an approved attachment: the sender looks the file up by its hash and re-checks it. */
export const attachmentPath = (userId: string, sha: string) => `${userId}/outreach/${sha}.pdf`;

type FullMessage = OutreachMessage & { target: OutreachTarget & { campaign: OutreachCampaign } };

export interface ComposedMessage {
  message: FullMessage;
  to: string;
  subject: string | null;
  /** Body exactly as it will be sent (footer included for email). */
  bodyAsSent: string;
  profile: OutreachProfile | null;
}

/** The single place that turns a stored message into what gets sent and what gets hashed. Approval and the sender both use it. */
export async function composeMessage(messageId: string, userId?: string): Promise<ComposedMessage> {
  const message = await db.outreachMessage.findFirst({
    where: { id: messageId, ...(userId ? { target: { campaign: { userId } } } : {}) },
    include: { target: { include: { campaign: true } } },
  });
  if (!message) throw notFound("Message");
  const profile = await db.outreachProfile.findUnique({ where: { userId: message.target.campaign.userId } });
  if (message.channel === "EMAIL") {
    if (!profile?.senderName || !profile.postalAddress) throw new AppError("Your sender name and postal address are required before sending.", 400, "profile_incomplete");
    const footer = emailFooter({ senderName: profile.senderName, postalAddress: profile.postalAddress, targetId: message.targetId });
    // Follow-ups reuse the first email's subject so they stay in the same Gmail thread (Gmail requires matching subjects).
    const first = message.step > 1 ? await db.outreachMessage.findUnique({ where: { targetId_channel_step: { targetId: message.targetId, channel: "EMAIL", step: 1 } }, select: { subject: true } }) : null;
    return { message, to: message.target.email ?? "", subject: first?.subject ?? message.subject, bodyAsSent: composeEmailText(message.body, footer), profile };
  }
  return { message, to: message.target.linkedinUrl ?? "", subject: null, bodyAsSent: message.body, profile };
}

/** Render the tailored resume PDF once, store it under its own hash, and return that hash. */
async function prepareAttachment(userId: string, campaign: OutreachCampaign): Promise<string> {
  const row = campaign.tailoredResumeId ? await db.tailoredResume.findFirst({ where: { id: campaign.tailoredResumeId, userId }, select: { contentJson: true } }) : null;
  const resumeRow = row ?? (await db.resume.findFirst({ where: { userId, isPrimary: true }, select: { parsedJson: true } }));
  if (!resumeRow) throw new AppError("Upload your resume first.", 400, "no_resume");
  const resume = resumeSchema.parse("contentJson" in resumeRow ? resumeRow.contentJson : resumeRow.parsedJson);
  const pdf = await renderResumePdf(resume);
  const sha = sha256Hex(pdf);
  if (!(await getFileBytes(attachmentPath(userId, sha)))) await putFile(attachmentPath(userId, sha), pdf, "application/pdf");
  return sha;
}

async function targetIsSendable(t: OutreachTarget): Promise<{ ok: boolean; why?: string }> {
  const suppressed = t.email ? (await suppressedSet([t.email])).has(t.email) : false;
  const gate = targetGate({ email: t.email, emailVerification: t.emailVerification, confidence: t.confidence, country: t.country, riskAcknowledgedAt: t.riskAcknowledgedAt, suppressed });
  if (!gate.canProceed) return { ok: false, why: gate.hardBlocks.length ? "This contact cannot be used (opted out, undeliverable, or in a region we do not contact)." : "Accept or remove this contact before approving messages to them." };
  if (["REPLIED", "BOUNCED", "OPTED_OUT", "COMPLETED", "CANCELLED"].includes(t.state)) return { ok: false, why: "This contact is no longer active." };
  return { ok: true };
}

/** Approve one message. Re-runs every check; nothing the browser sent is trusted. */
export async function approveMessage(userId: string, messageId: string): Promise<OutreachMessage> {
  const c = await composeMessage(messageId, userId);
  const { message, target } = { message: c.message, target: c.message.target };
  if (message.state === "APPROVED" && message.approvedTextHash) return message; // idempotent
  if (message.state !== "DRAFT") throw new AppError("Only a draft can be approved.", 409, "not_draft");
  if (!["DRAFT", "ACTIVE", "PAUSED"].includes(target.campaign.status)) throw new AppError("This campaign is finished.", 409, "campaign_closed");
  await requireCompleteProfile(userId);

  const sendable = await targetIsSendable(target);
  if (!sendable.ok) throw new AppError(sendable.why!, 409, "target_not_sendable");
  if (message.channel === "EMAIL" && !target.email) throw new AppError("This contact has no email address.", 409, "no_email");

  const ctx = await loadVerifyContext(userId, target.campaign, target, c.profile!.senderName!);
  const violations = [...structureViolations({ email: message.channel === "EMAIL" ? [{ subject: message.subject ?? "", body: message.body }] : [], linkedinNote: message.channel === "LINKEDIN_NOTE" ? message.body : "" }), ...verifyMessage(`${message.subject ?? ""}\n${message.body}`, ctx)];
  if (violations.length) {
    throw new AppError(`This message cannot be approved yet: ${describeViolations(violations)}. Edit it, and only use facts that are in your profile and the job.`, 422, "verifier_failed");
  }

  const attachmentSha256 = message.channel === "EMAIL" ? await prepareAttachment(userId, target.campaign) : null;
  const hash = approvalHash({ channel: message.channel, step: message.step, to: c.to, subject: c.subject, body: c.bodyAsSent, attachmentSha256 });

  // Optimistic write: only if the text we hashed is still what is stored (no race with an edit).
  const res = await db.outreachMessage.updateMany({
    where: { id: message.id, state: "DRAFT", body: message.body, subject: message.subject },
    data: { state: "APPROVED", approvedAt: new Date(), approvedTextHash: hash, sendKey: sendKeyFor(message.id, hash), attachmentSha256 },
  });
  if (res.count === 0) throw new AppError("The message changed while you were approving it. Please review and approve again.", 409, "changed");
  await audit({ userId, action: "message.approved", entityType: "OutreachMessage", entityId: message.id, detail: { channel: message.channel, step: message.step, hash: hash.slice(0, 16) } }, { strict: true });
  if (message.step === 1 && message.channel === "EMAIL" && target.campaign.status === "DRAFT") await db.outreachTarget.update({ where: { id: target.id }, data: { state: "APPROVED" } });
  if (["ACTIVE", "PAUSED"].includes(target.campaign.status)) await scheduleLateApproval(message.id);
  return db.outreachMessage.findUniqueOrThrow({ where: { id: message.id } });
}

/** Edit an unsent message. Any change drops approval and scheduling: the candidate must approve the new text. */
export async function editMessage(userId: string, messageId: string, input: { subject?: string | null; body: string }): Promise<OutreachMessage> {
  const m = await db.outreachMessage.findFirst({ where: { id: messageId, target: { campaign: { userId } } } });
  if (!m) throw notFound("Message");
  if (["SENDING", "SENT"].includes(m.state)) throw new AppError("This message has already been sent.", 409, "already_sent");
  // Steps 2 and 3 do not have their own subject: they inherit step 1's.
  const subject = m.channel === "EMAIL" ? (m.step > 1 ? m.subject : (input.subject ?? m.subject ?? "").trim()) : null;
  const body = input.body.trim();
  if (!body) throw new AppError("The message cannot be empty.", 400, "validation");
  if (body.length > 5000 || (subject?.length ?? 0) > 300) throw new AppError("That message is too long.", 400, "validation");
  if (subject === m.subject && body === m.body) return m;

  const updated = await db.outreachMessage.update({
    where: { id: m.id },
    data: { subject, body, state: "DRAFT", approvedAt: null, approvedTextHash: null, sendKey: null, attachmentSha256: null, scheduledAt: null, lastError: null },
  });
  if (m.channel === "EMAIL" && m.step === 1 && subject !== m.subject) {
    await db.outreachMessage.updateMany({
      where: { targetId: m.targetId, channel: "EMAIL", step: { gt: 1 }, state: { in: ["APPROVED", "SCHEDULED"] } },
      data: { subject, state: "DRAFT", approvedAt: null, approvedTextHash: null, sendKey: null, attachmentSha256: null, scheduledAt: null },
    });
    await db.outreachMessage.updateMany({ where: { targetId: m.targetId, channel: "EMAIL", step: { gt: 1 }, state: "DRAFT" }, data: { subject } });
  }
  await audit({ userId, action: "message.edited", entityType: "OutreachMessage", entityId: m.id, detail: { wasApproved: m.state !== "DRAFT" } });
  return updated;
}

export async function cancelMessage(userId: string, messageId: string): Promise<void> {
  const res = await db.outreachMessage.updateMany({
    where: { id: messageId, target: { campaign: { userId } }, state: { in: ["DRAFT", "APPROVED", "SCHEDULED", "FAILED"] } },
    data: { state: "CANCELLED", scheduledAt: null },
  });
  if (res.count === 0) throw new AppError("This message can no longer be cancelled.", 409, "not_cancellable");
  await audit({ userId, action: "message.cancelled", entityType: "OutreachMessage", entityId: messageId });
}

/** Recompute the hash from what is stored NOW. The sender calls this and refuses on any mismatch (defence in depth). */
export async function currentHash(messageId: string): Promise<{ hash: string; composed: ComposedMessage }> {
  const composed = await composeMessage(messageId);
  const m = composed.message;
  return { hash: approvalHash({ channel: m.channel, step: m.step, to: composed.to, subject: composed.subject, body: composed.bodyAsSent, attachmentSha256: m.attachmentSha256 }), composed };
}
