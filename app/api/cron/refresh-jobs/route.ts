import { NextResponse } from "next/server";
import { assertCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { refreshJobs } from "@/lib/jobs/refresh";
import { log } from "@/lib/logger";
import { computeMatchesForUser } from "@/lib/matching/run";
import { mapLimit } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_USERS_PER_RUN = 60;

/** Every 6 hours (vercel.json): fetch all sources → dedupe → store → refresh matches for active users. */
export const GET = handler("cron_refresh_jobs", async (request: Request) => {
  assertCron(request);
  const summary = await refreshJobs();

  const users = await db.resume.findMany({
    where: { isPrimary: true },
    select: { userId: true },
    orderBy: { createdAt: "desc" },
    take: MAX_USERS_PER_RUN,
  });
  const results = await mapLimit(users, 3, (u) => computeMatchesForUser(u.userId));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) log.warn("cron_match_failures", { failed, total: users.length });

  return NextResponse.json({ ...summary, usersMatched: users.length - failed, usersFailed: failed });
});
