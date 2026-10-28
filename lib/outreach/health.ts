import { outreach } from "@/config/outreach";
import { audit } from "@/lib/audit";
import { clockNow } from "@/lib/clock";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/utils";

/**
 * Send health and auto-pause (spec section 5, safety rules). Over a rolling window, a bounce rate or complaint rate above
 * its threshold pauses the candidate's sending automatically. Held mail is kept (not deleted); the candidate is told, and
 * only a person (admin) can lift an automatic pause, so a runaway problem cannot restart itself.
 */
export interface HealthStats {
  sent: number;
  bounces: number;
  complaints: number;
  bounceRate: number;
  complaintRate: number;
}

export function judgeHealth(h: Pick<HealthStats, "sent" | "bounces" | "complaints">): { pause: boolean; reason: string | null } {
  const cfg = outreach.health;
  const bounceRate = h.sent > 0 ? h.bounces / h.sent : 0;
  const complaintRate = h.sent > 0 ? h.complaints / h.sent : 0;
  if (h.complaints >= cfg.maxComplaints) return { pause: true, reason: `${h.complaints} spam complaints in ${cfg.windowDays} days` };
  if (h.sent >= cfg.minSample && bounceRate > cfg.maxBounceRate) return { pause: true, reason: `bounce rate ${(bounceRate * 100).toFixed(1)}% is above ${(cfg.maxBounceRate * 100).toFixed(0)}%` };
  if (h.sent >= cfg.minSample && complaintRate > cfg.maxComplaintRate) return { pause: true, reason: `complaint rate ${(complaintRate * 100).toFixed(2)}% is above ${(cfg.maxComplaintRate * 100).toFixed(1)}%` };
  return { pause: false, reason: null };
}

export async function healthFor(userId: string, now?: Date): Promise<HealthStats> {
  const at = now ?? (await clockNow());
  const since = daysAgo(outreach.health.windowDays, at);
  const base = { channel: "EMAIL" as const, target: { campaign: { userId } } };
  const [sent, bounces, complaints] = await Promise.all([
    db.outreachMessage.count({ where: { ...base, state: "SENT", step: 1, sentAt: { gte: since } } }), // distinct recipients, not follow-ups
    db.outreachTarget.count({ where: { campaign: { userId }, state: "BOUNCED", updatedAt: { gte: since } } }),
    db.reply.count({ where: { ruleHit: "complaint", receivedAt: { gte: since }, message: { target: { campaign: { userId } } } } }),
  ]);
  return { sent, bounces, complaints, bounceRate: sent ? bounces / sent : 0, complaintRate: sent ? complaints / sent : 0 };
}

/** Evaluate one candidate and pause them if needed. Idempotent. */
export async function evaluateHealth(userId: string, now?: Date): Promise<{ paused: boolean; reason: string | null; stats: HealthStats }> {
  const stats = await healthFor(userId, now);
  const verdict = judgeHealth(stats);
  if (verdict.pause) {
    const profile = await db.outreachProfile.findUnique({ where: { userId }, select: { sendingPausedAt: true } });
    if (!profile?.sendingPausedAt) {
      await db.outreachProfile.upsert({ where: { userId }, create: { userId, sendingPausedAt: new Date(), pauseReason: verdict.reason, pausedBy: "SYSTEM" }, update: { sendingPausedAt: new Date(), pauseReason: verdict.reason, pausedBy: "SYSTEM" } });
      await audit({ userId, action: "sending.auto_paused", entityType: "OutreachProfile", entityId: userId, detail: { reason: verdict.reason, ...stats } });
    }
  }
  return { paused: verdict.pause, reason: verdict.reason, stats };
}

/** Hourly job: everyone with recent sends. */
export async function evaluateAllHealth(now?: Date): Promise<number> {
  const at = now ?? (await clockNow());
  const users = await db.outreachCampaign.findMany({ where: { status: { in: ["ACTIVE", "PAUSED"] } }, distinct: ["userId"], select: { userId: true } });
  let paused = 0;
  for (const u of users) if ((await evaluateHealth(u.userId, at)).paused) paused++;
  return paused;
}

/** The candidate may lift their OWN pause; an automatic pause needs an admin (see the admin console). */
export async function resumeSending(userId: string, by: "USER" | "ADMIN"): Promise<boolean> {
  const p = await db.outreachProfile.findUnique({ where: { userId } });
  if (!p?.sendingPausedAt) return true;
  if (p.pausedBy === "SYSTEM" && by !== "ADMIN") return false;
  await db.outreachProfile.update({ where: { userId }, data: { sendingPausedAt: null, pauseReason: null, pausedBy: null } });
  await audit({ userId, action: "sending.resumed", entityType: "OutreachProfile", entityId: userId, detail: { by } });
  return true;
}
