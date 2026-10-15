import type { AlertFrequency } from "@/generated/prisma/enums";
import { renderDigestEmail, renderDigestWhatsapp, type DigestJob } from "@/lib/alerts/render";
import { sendEmail, sendWhatsapp, type SendResult } from "@/lib/alerts/channels";
import { db } from "@/lib/db";
import { filtersSchema } from "@/lib/jobs/filters";
import { jobCardSelect, queryJobs } from "@/lib/jobs/query";
import { log } from "@/lib/logger";
import { daysAgo } from "@/lib/utils";

const MAX_JOBS = 8;

/** Whether a daily / weekly subscription should fire now. Weekly = Mondays (or overdue by 6.5+ days). */
export function isDue(frequency: AlertFrequency, lastAlertAt: Date | null, now = new Date()): boolean {
  if (frequency === "OFF") return false;
  const hours = lastAlertAt ? (now.getTime() - lastAlertAt.getTime()) / 3_600_000 : Infinity;
  if (frequency === "DAILY") return hours >= 20;
  return hours >= 156 || (now.getUTCDay() === 1 && hours >= 20);
}

async function deliver(
  userId: string,
  channels: { email?: { to: string }; whatsapp?: { to: string } },
  title: string,
  jobs: DigestJob[],
): Promise<{ sent: boolean; results: Record<string, SendResult> }> {
  const results: Record<string, SendResult> = {};
  if (channels.email) {
    const { html, text } = renderDigestEmail({ title, jobs });
    results.email = await sendEmail({ to: channels.email.to, subject: `${title} — ${jobs.length} new ${jobs.length === 1 ? "job" : "jobs"}`, html, text });
  }
  if (channels.whatsapp) {
    results.whatsapp = await sendWhatsapp({ to: channels.whatsapp.to, body: renderDigestWhatsapp({ title, jobs }) });
  }
  for (const [channel, r] of Object.entries(results)) {
    await db.alertLog.create({ data: { userId, channel, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", jobCount: jobs.length, detail: r.detail ?? null } });
  }
  return { sent: Object.values(results).some((r) => r.ok), results };
}

/** Top new matches for the account-level digest. */
async function topNewMatches(userId: string, minScore: number): Promise<DigestJob[]> {
  const rows = await db.match.findMany({
    where: { userId, notifiedAt: null, score: { gte: minScore }, job: { postedAt: { gte: daysAgo(7) } } },
    orderBy: [{ score: "desc" }, { job: { postedAt: "desc" } }],
    take: MAX_JOBS,
    select: { id: true, score: true, reason: true, job: { select: jobCardSelect } },
  });
  return rows.map((m) => ({ ...m.job, score: m.score, reason: m.reason, _matchId: m.id }));
}

export interface AlertRunSummary {
  users: number;
  digestsSent: number;
  savedSearchesSent: number;
  skipped: number;
  failed: number;
}

/** Send every due alert. Called by the daily cron and `npm run send-alerts`. */
export async function runAlerts(opts: { now?: Date; onlyUserId?: string; force?: boolean } = {}): Promise<AlertRunSummary> {
  const now = opts.now ?? new Date();
  const summary: AlertRunSummary = { users: 0, digestsSent: 0, savedSearchesSent: 0, skipped: 0, failed: 0 };

  const users = await db.user.findMany({
    where: { ...(opts.onlyUserId ? { id: opts.onlyUserId } : {}), OR: [{ preferences: { alertFrequency: { not: "OFF" } } }, { savedSearches: { some: { alertFrequency: { not: "OFF" } } } }] },
    include: { preferences: true, savedSearches: { where: { alertFrequency: { not: "OFF" } } } },
  });

  for (const user of users) {
    summary.users++;
    const prefs = user.preferences;

    // 1) Account digest: top new matches
    if (prefs && prefs.alertFrequency !== "OFF" && (opts.force || isDue(prefs.alertFrequency, prefs.lastAlertAt, now))) {
      const jobs = await topNewMatches(user.id, prefs.alertMinScore);
      if (jobs.length) {
        const channels = {
          email: prefs.alertEmail ? { to: user.email } : undefined,
          whatsapp: prefs.alertWhatsapp && prefs.whatsappNumber ? { to: prefs.whatsappNumber } : undefined,
        };
        const { sent, results } = await deliver(user.id, channels, "Your top new job matches", jobs);
        if (sent) {
          await db.match.updateMany({ where: { id: { in: (jobs as Array<DigestJob & { _matchId: string }>).map((j) => j._matchId) } }, data: { notifiedAt: now } });
          await db.preferences.update({ where: { userId: user.id }, data: { lastAlertAt: now } });
          summary.digestsSent++;
        } else {
          if (Object.values(results).some((r) => r.skipped)) summary.skipped++;
          else summary.failed++;
        }
      }
    }

    // 2) Saved searches
    for (const s of user.savedSearches) {
      if (!opts.force && !isDue(s.alertFrequency, s.lastAlertAt, now)) continue;
      const since = s.lastAlertAt ?? daysAgo(s.alertFrequency === "WEEKLY" ? 7 : 1);
      const filters = filtersSchema.safeParse(s.filters);
      if (!filters.success) continue;
      const page = await queryJobs(user.id, { ...filters.data, sort: undefined }, { since, pageSize: MAX_JOBS });
      if (page.items.length === 0) {
        await db.savedSearch.update({ where: { id: s.id }, data: { lastAlertAt: now } });
        continue;
      }
      const jobs: DigestJob[] = page.items.map((i) => ({ ...i.job, score: i.match?.score ?? null, reason: i.match?.reason ?? null }));
      const channels = {
        email: s.alertEmail ? { to: user.email } : undefined,
        whatsapp: s.alertWhatsapp && prefs?.whatsappNumber ? { to: prefs.whatsappNumber } : undefined,
      };
      const { sent } = await deliver(user.id, channels, `New jobs for “${s.name}”`, jobs);
      if (sent) {
        await db.savedSearch.update({ where: { id: s.id }, data: { lastAlertAt: now } });
        summary.savedSearchesSent++;
      } else summary.skipped++;
    }
  }
  log.info("alerts_run", { ...summary });
  return summary;
}
