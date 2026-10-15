import "./_env";
import { db } from "../lib/db";
import { refreshJobs } from "../lib/jobs/refresh";
import { computeMatchesForUser } from "../lib/matching/run";

/**
 * Admin script: `npm run fetch-jobs [-- --only=remotive,greenhouse] [--days=14] [--match]`
 * Fetches every enabled source, dedupes, stores — and with --match, refreshes every user's matches.
 */
async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
  const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7)) || 14;

  const summary = await refreshJobs({ only, postedWithinDays: days });
  console.table(summary.reports.map((r) => ({ source: r.source, enabled: r.enabled, fetched: r.fetched, ms: r.ms, error: r.error ?? "" })));
  console.log(`Stored: ${summary.ingest.inserted} new, ${summary.ingest.updated} updated, ${summary.ingest.unique} unique of ${summary.ingest.received} fetched (${summary.ms} ms). Purged stale: ${summary.purged}.`);

  if (args.includes("--match")) {
    const users = await db.resume.findMany({ where: { isPrimary: true }, select: { userId: true } });
    for (const u of users) {
      const m = await computeMatchesForUser(u.userId).catch((e: Error) => ({ error: e.message }));
      console.log(`matches for ${u.userId}:`, m);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
