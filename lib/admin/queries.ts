import { outreach } from "@/config/outreach";
import { hashEmail, normalizeEmail } from "@/lib/compliance/suppression";
import { candidateSpendMicros, costCeilingMicros } from "@/lib/billing/cost";
import { db } from "@/lib/db";
import { healthFor, judgeHealth } from "@/lib/outreach/health";
import { getPricing } from "@/lib/settings";
import { daysAgo } from "@/lib/utils";

export const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(micros < 10_000 && micros !== 0 ? 4 : 2)}`;

/** Provider spend, AI spend, volumes and an estimated margin (credits spent x configured credit value - what it cost us). */
export async function overview(now = new Date()) {
  const since30 = daysAgo(30, now);
  const since1 = daysAgo(1, now);
  const [byProvider, ai, aiByFeature, sent24, replies24, bounced24, campaigns, spentCredits, purchased, pricing, users] = await Promise.all([
    db.providerUsage.groupBy({ by: ["provider"], where: { createdAt: { gte: since30 } }, _sum: { costMicros: true }, _count: { _all: true } }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: since30 } }, _sum: { costMicros: true, inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    db.aiUsage.groupBy({ by: ["feature"], where: { createdAt: { gte: since30 } }, _sum: { costMicros: true }, _count: { _all: true } }),
    db.outreachMessage.count({ where: { state: "SENT", channel: "EMAIL", sentAt: { gte: since1 } } }),
    db.reply.count({ where: { receivedAt: { gte: since1 } } }),
    db.outreachTarget.count({ where: { state: "BOUNCED", updatedAt: { gte: since1 } } }),
    db.outreachCampaign.groupBy({ by: ["status"], _count: { _all: true } }),
    db.creditLedger.aggregate({ where: { reason: "SPEND_TARGET", createdAt: { gte: since30 } }, _sum: { delta: true } }),
    db.creditLedger.aggregate({ where: { reason: "PURCHASE", createdAt: { gte: since30 } }, _sum: { delta: true } }),
    getPricing(),
    db.outreachProfile.count(),
  ]);
  const providerCost = byProvider.reduce((n, p) => n + (p._sum.costMicros ?? 0), 0);
  const aiCost = ai._sum.costMicros ?? 0;
  const creditsSpent = -(spentCredits._sum.delta ?? 0);
  const revenueEstimate = creditsSpent * pricing.creditValueMicros;
  return {
    providers: byProvider.map((p) => ({ provider: p.provider, calls: p._count._all, costMicros: p._sum.costMicros ?? 0 })).sort((a, b) => b.costMicros - a.costMicros),
    ai: { calls: ai._count._all, costMicros: aiCost, inputTokens: ai._sum.inputTokens ?? 0, outputTokens: ai._sum.outputTokens ?? 0, byFeature: aiByFeature.map((f) => ({ feature: f.feature, calls: f._count._all, costMicros: f._sum.costMicros ?? 0 })).sort((a, b) => b.costMicros - a.costMicros) },
    last24h: { sent: sent24, replies: replies24, bounced: bounced24 },
    campaigns: Object.fromEntries(campaigns.map((c) => [c.status, c._count._all])) as Record<string, number>,
    credits: { spent30d: creditsSpent, purchased30d: purchased._sum.delta ?? 0 },
    margin: { providerCostMicros: providerCost, aiCostMicros: aiCost, revenueEstimateMicros: revenueEstimate, marginMicros: revenueEstimate - providerCost - aiCost, creditValueMicros: pricing.creditValueMicros },
    candidates: users,
  };
}

/** Per-candidate send health for the last 7 days, worst first. */
export async function sendHealth(now = new Date()) {
  const users = await db.outreachCampaign.findMany({ distinct: ["userId"], select: { userId: true }, take: 200 });
  const rows = await Promise.all(
    users.map(async ({ userId }) => {
      const [u, profile, acct, stats] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { email: true } }),
        db.outreachProfile.findUnique({ where: { userId }, select: { sendingPausedAt: true, pauseReason: true, pausedBy: true } }),
        db.connectedAccount.findFirst({ where: { userId }, select: { status: true, dailySendCap: true, accountEmail: true } }),
        healthFor(userId, now),
      ]);
      return { userId, email: u?.email ?? "(deleted)", paused: profile?.sendingPausedAt ? { reason: profile.pauseReason, by: profile.pausedBy } : null, mailbox: acct, ...stats, verdict: judgeHealth(stats) };
    }),
  );
  return rows.sort((a, b) => b.bounceRate + b.complaintRate * 10 - (a.bounceRate + a.complaintRate * 10));
}

/** Suppression list: totals, the latest entries (hash prefix only), and an exact-address lookup. */
export async function suppression(search?: string) {
  const [total, byReason, recent] = await Promise.all([
    db.suppressionEntry.count(),
    db.suppressionEntry.groupBy({ by: ["reason"], _count: { _all: true } }),
    db.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  let lookup: { email: string; suppressed: boolean; reason: string | null; since: Date | null } | null = null;
  if (search?.trim()) {
    const e = normalizeEmail(search);
    const hit = await db.suppressionEntry.findUnique({ where: { emailHash: hashEmail(e) } });
    lookup = { email: e, suppressed: Boolean(hit), reason: hit?.reason ?? null, since: hit?.createdAt ?? null };
  }
  return { total, byReason: byReason.map((r) => ({ reason: r.reason, count: r._count._all })), recent: recent.map((r) => ({ id: r.id, hash: `${r.emailHash.slice(0, 10)}…`, reason: r.reason, createdAt: r.createdAt })), lookup };
}

export async function auditLog(opts: { action?: string; userId?: string; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = { ...(opts.action ? { action: { contains: opts.action } } : {}), ...(opts.userId ? { userId: opts.userId } : {}) };
  const [total, rows] = await Promise.all([db.auditEvent.count({ where }), db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 })]);
  return { total, page, pages: Math.max(1, Math.ceil(total / 50)), rows };
}

/** Candidates worth a human look: auto-paused, high bounce, any complaint, many campaigns in a day, near the cost ceiling. */
export async function abuseReview(now = new Date()) {
  const health = await sendHealth(now);
  const since1 = daysAgo(1, now);
  const flagged: Array<{ userId: string; email: string; reasons: string[]; paused: boolean }> = [];
  for (const h of health) {
    const reasons: string[] = [];
    if (h.paused) reasons.push(`sending paused (${h.paused.by === "SYSTEM" ? "automatic" : "by user"}): ${h.paused.reason ?? "no reason"}`);
    if (h.sent >= 5 && h.bounceRate > outreach.health.maxBounceRate * 0.6) reasons.push(`bounce rate ${(h.bounceRate * 100).toFixed(1)}%`);
    if (h.complaints > 0) reasons.push(`${h.complaints} complaint${h.complaints > 1 ? "s" : ""}`);
    const started = await db.outreachCampaign.count({ where: { userId: h.userId, status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] }, createdAt: { gte: since1 } } });
    if (started > 5) reasons.push(`${started} campaigns started in 24 hours`);
    const [spent, ceiling] = await Promise.all([candidateSpendMicros(h.userId), costCeilingMicros(h.userId)]);
    if (ceiling > 0 && spent >= ceiling * 0.8) reasons.push(`cost ${usd(spent)} of ${usd(ceiling)} ceiling`);
    if (reasons.length) flagged.push({ userId: h.userId, email: h.email, reasons, paused: Boolean(h.paused) });
  }
  return flagged;
}
