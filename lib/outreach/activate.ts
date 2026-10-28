import { outreach } from "@/config/outreach";
import { audit } from "@/lib/audit";
import { clockNow } from "@/lib/clock";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { assertCompanyAvailable } from "@/lib/outreach/company";
import { recipientZone } from "@/lib/outreach/preview";
import { requireCompleteProfile } from "@/lib/outreach/profile";
import { computeSchedule, jitterMinutes, nextWorkingInstant } from "@/lib/outreach/schedule";

/**
 * Start sending: schedule every APPROVED email (day 0 / 3 / 7 in each recipient's working hours) and mark the campaign
 * ACTIVE. Messages that are not approved stay drafts and are simply never sent. Re-checks the one-touch-per-company rule.
 */
export async function activateCampaign(userId: string, campaignId: string) {
  const profile = await requireCompleteProfile(userId);
  const campaign = await db.outreachCampaign.findFirst({
    where: { id: campaignId, userId },
    include: { targets: { where: { state: { notIn: ["CANCELLED", "OPTED_OUT", "BOUNCED", "REPLIED"] } }, orderBy: { createdAt: "asc" }, include: { messages: true } } },
  });
  if (!campaign) throw notFound("Campaign");
  if (campaign.status !== "DRAFT") throw new AppError("This campaign has already started.", 409, "already_started");

  const account = await db.connectedAccount.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
  if (!account) throw new AppError("Connect your Gmail first. Messages are sent from your own mailbox.", 409, "no_mailbox");
  await assertCompanyAvailable(userId, campaign.companyKey, campaign.id);

  const ready = campaign.targets.filter((t) => t.messages.some((m) => m.channel === "EMAIL" && m.step === 1 && m.state === "APPROVED"));
  if (ready.length === 0) throw new AppError("Approve at least the first email to someone before starting.", 409, "nothing_approved");
  const alreadyReached = await db.outreachTarget.count({ where: { campaignId: campaign.id, state: { in: ["SENT", "COMPLETED", "REPLIED", "BOUNCED", "OPTED_OUT"] } } });
  const room = Math.max(0, outreach.maxTargetsPerCompanyPerCampaign * 2 - alreadyReached);
  if (room === 0) throw new AppError("You have already reached out to enough people at this company.", 409, "company_limit");
  const chosen = ready.slice(0, Math.min(outreach.maxTargetsPerCompanyPerCampaign, room));

  const now = await clockNow();
  let scheduled = 0;
  for (const [i, t] of chosen.entries()) {
    const tz = recipientZone(t.country, profile.timeZone);
    const offset = i * (outreach.minSpacingMinutes + jitterMinutes(t.id, outreach.spacingJitterMinutes));
    const times = computeSchedule({ now, recipientTz: tz, seed: t.id, offsetMinutes: offset });
    for (const s of times) {
      const msg = t.messages.find((m) => m.channel === "EMAIL" && m.step === s.step && m.state === "APPROVED");
      if (!msg) continue;
      await db.outreachMessage.update({ where: { id: msg.id }, data: { state: "SCHEDULED", scheduledAt: s.at } });
      scheduled++;
    }
    await db.outreachTarget.update({ where: { id: t.id }, data: { state: "SCHEDULED" } });
  }
  // Targets nobody approved are left out of this campaign.
  await db.outreachTarget.updateMany({ where: { id: { in: campaign.targets.filter((t) => !chosen.includes(t)).map((t) => t.id) }, state: { in: ["DISCOVERED", "VERIFIED", "DRAFTED"] } }, data: { state: "CANCELLED" } });
  await db.outreachCampaign.update({ where: { id: campaign.id }, data: { status: "ACTIVE" } });

  // The job shows "Outreach active" in the tracker (A6): make sure it is tracked.
  if (campaign.jobId) {
    await db.application.upsert({ where: { userId_jobId: { userId, jobId: campaign.jobId } }, create: { userId, jobId: campaign.jobId, tailoredResumeId: campaign.tailoredResumeId, status: "SAVED" }, update: {} });
  }
  await audit({ userId, action: "campaign.activated", entityType: "OutreachCampaign", entityId: campaign.id, detail: { targets: chosen.length, scheduled } });
  return { scheduled, targets: chosen.length };
}

/**
 * A message approved AFTER the campaign started (for example a follow-up the candidate edited and re-approved) is scheduled
 * immediately: step N waits the planned number of days after step 1, and never goes out before the next working window.
 */
export async function scheduleLateApproval(messageId: string): Promise<void> {
  const m = await db.outreachMessage.findUnique({ where: { id: messageId }, include: { target: { include: { campaign: true } } } });
  if (!m || m.state !== "APPROVED" || m.channel !== "EMAIL" || !["ACTIVE", "PAUSED"].includes(m.target.campaign.status)) return;
  if (["REPLIED", "BOUNCED", "OPTED_OUT", "COMPLETED", "CANCELLED"].includes(m.target.state)) return;
  const profile = await db.outreachProfile.findUnique({ where: { userId: m.target.campaign.userId }, select: { timeZone: true } });
  const tz = recipientZone(m.target.country, profile?.timeZone ?? "Asia/Kolkata");
  const now = await clockNow();
  const first = m.step > 1 ? await db.outreachMessage.findUnique({ where: { targetId_channel_step: { targetId: m.targetId, channel: "EMAIL", step: 1 } } }) : null;
  const base = first?.sentAt ?? first?.scheduledAt ?? now;
  const wanted = new Date(base.getTime() + (outreach.sequenceDays[m.step - 1] ?? 0) * 86_400_000);
  const earliest = new Date(Math.max(wanted.getTime(), now.getTime() + 15 * 60_000));
  await db.outreachMessage.update({ where: { id: m.id }, data: { state: "SCHEDULED", scheduledAt: nextWorkingInstant(earliest, tz, m.id) } });
  if (m.step === 1) await db.outreachTarget.update({ where: { id: m.targetId }, data: { state: "SCHEDULED" } });
}

/** Journey 4: after a finished sequence, reopen the campaign as a draft so the next people can be found, reviewed and approved. */
export async function reopenForNextTargets(userId: string, campaignId: string) {
  const c = await db.outreachCampaign.findFirst({ where: { id: campaignId, userId } });
  if (!c) throw notFound("Campaign");
  if (c.status !== "COMPLETED") throw new AppError("You can add more people once this outreach has finished.", 409, "not_completed");
  await db.outreachCampaign.update({ where: { id: c.id }, data: { status: "DRAFT", finishedAt: null } });
  await audit({ userId, action: "campaign.reopened", entityType: "OutreachCampaign", entityId: c.id });
}

/** Candidate-controlled: pause (held, nothing lost), resume, or cancel everything that has not been sent yet. */
export async function setCampaignStatus(userId: string, campaignId: string, next: "PAUSED" | "ACTIVE" | "CANCELLED") {
  const c = await db.outreachCampaign.findFirst({ where: { id: campaignId, userId } });
  if (!c) throw notFound("Campaign");
  if (["COMPLETED", "CANCELLED"].includes(c.status)) throw new AppError("This campaign is already finished.", 409, "campaign_closed");
  if (next === "ACTIVE" && c.status !== "PAUSED") throw new AppError("Only a paused campaign can be resumed.", 409, "not_paused");
  if (next === "PAUSED" && c.status !== "ACTIVE") throw new AppError("Only a running campaign can be paused.", 409, "not_active");

  await db.outreachCampaign.update({ where: { id: c.id }, data: { status: next, ...(next === "CANCELLED" ? { finishedAt: new Date() } : {}) } });
  if (next === "CANCELLED") {
    await db.outreachMessage.updateMany({ where: { target: { campaignId: c.id }, state: { in: ["DRAFT", "APPROVED", "SCHEDULED", "FAILED"] } }, data: { state: "CANCELLED", scheduledAt: null } });
    await db.outreachTarget.updateMany({ where: { campaignId: c.id, state: { notIn: ["REPLIED", "BOUNCED", "OPTED_OUT", "COMPLETED"] } }, data: { state: "CANCELLED" } });
  }
  await audit({ userId, action: `campaign.${next === "ACTIVE" ? "resumed" : next === "PAUSED" ? "paused" : "cancelled"}`, entityType: "OutreachCampaign", entityId: c.id });
}
