import { matching } from "@/config/matching";
import { env, flags } from "@/lib/env";
import { scoreJobsWithAi } from "@/lib/ai/score-matches";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { buildProfiles, EMPTY_PREFERENCES } from "@/lib/matching/profile";
import { scoreStage1 } from "@/lib/matching/stage1";
import { assertAiQuota } from "@/lib/rate-limit";
import { resumeSchema } from "@/lib/resume/schema";
import { chunk, daysAgo } from "@/lib/utils";

export interface MatchRunSummary {
  considered: number;
  kept: number;
  aiScored: number;
  aiSkippedReason?: string;
}

const toExperienceFit = { under: "UNDER", fit: "FIT", over: "OVER" } as const;

/**
 * Two-stage matching for one user.
 *  Stage 1 (no AI): filters + keyword/title/experience scoring over recent jobs → keep the best `stage1Keep`.
 *  Stage 2 (Claude Haiku, batched): re-score the best `stage2Top`, caching results in Match.
 * Jobs already AI-scored for the same profile are never re-scored.
 */
export async function computeMatchesForUser(userId: string, opts: { skipAi?: boolean } = {}): Promise<MatchRunSummary> {
  const resumeRow = await db.resume.findFirst({ where: { userId, isPrimary: true } });
  if (!resumeRow) throw new AppError("Upload a resume first so we can match jobs to it.", 400, "no_resume");
  const resume = resumeSchema.parse(resumeRow.parsedJson);
  const prefs = (await db.preferences.findUnique({ where: { userId } })) ?? EMPTY_PREFERENCES;
  const { stage1, ai, hash } = buildProfiles(resumeRow.id, resume, prefs);

  const jobs = await db.job.findMany({
    where: { ownerUserId: null, postedAt: { gte: daysAgo(matching.windowDays) } },
    orderBy: { postedAt: "desc" },
    take: 5000,
    select: {
      id: true, title: true, company: true, location: true, country: true, isRemote: true, employmentType: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, descriptionText: true, skills: true,
    },
  });

  const scored = jobs
    .map((j) => ({ job: j, r: scoreStage1(stage1, j) }))
    .filter((x): x is { job: (typeof jobs)[number]; r: NonNullable<ReturnType<typeof scoreStage1>> } => x.r !== null)
    .sort((a, b) => b.r.score - a.r.score)
    .slice(0, matching.stage1Keep);

  const existing = await db.match.findMany({ where: { userId }, select: { id: true, jobId: true, aiScored: true, profileHash: true } });
  const existingByJob = new Map(existing.map((m) => [m.jobId, m]));
  const keepIds = new Set(scored.map((s) => s.job.id));

  // Drop matches that no longer qualify (profile changed, job fell out of the window).
  const stale = existing.filter((m) => !keepIds.has(m.jobId)).map((m) => m.id);
  for (const ids of chunk(stale, 500)) await db.match.deleteMany({ where: { id: { in: ids } } });

  for (const batch of chunk(scored, 100)) {
    await db.$transaction(
      batch.flatMap(({ job, r }) => {
        const cur = existingByJob.get(job.id);
        // Keep a valid cached AI score for an unchanged profile.
        if (cur?.aiScored && cur.profileHash === hash) return [];
        const data = {
          stage1Score: r.score,
          score: r.score,
          aiScored: false,
          profileHash: hash,
          reason: r.reason,
          matchingSkills: r.matchingSkills,
          missingSkills: r.missingSkills,
          experienceFit: r.experienceFit ? toExperienceFit[r.experienceFit] : null,
        };
        return [db.match.upsert({ where: { userId_jobId: { userId, jobId: job.id } }, create: { userId, jobId: job.id, ...data }, update: data })];
      }),
    );
  }

  // ── Stage 2 ────────────────────────────────────────────────────────────────
  const summary: MatchRunSummary = { considered: jobs.length, kept: scored.length, aiScored: 0 };
  if (opts.skipAi || !flags.ai || !env.aiMatchScoring) {
    summary.aiSkippedReason = opts.skipAi ? "skipped" : !flags.ai ? "No AI key set — using keyword scores" : "AI scoring is off (AI_MATCH_SCORING=false) — using keyword scores";
    return summary;
  }

  const cached = new Set(
    (await db.match.findMany({ where: { userId, aiScored: true, profileHash: hash }, select: { jobId: true } })).map((m) => m.jobId),
  );
  const todo = scored.filter((s) => !cached.has(s.job.id)).slice(0, matching.stage2Top);
  if (todo.length === 0) return summary;

  try {
    await assertAiQuota(userId, "score_matches");
    const results = await scoreJobsWithAi(
      userId,
      ai,
      todo.map(({ job }) => ({ id: job.id, title: job.title, company: job.company, location: job.location, isRemote: job.isRemote, description: job.descriptionText })),
    );
    for (const { job, r } of todo) {
      const res = results.get(job.id);
      if (!res) continue;
      await db.match.update({
        where: { userId_jobId: { userId, jobId: job.id } },
        data: {
          aiScored: true,
          score: Math.round(res.score * 0.8 + r.score * 0.2),
          reason: res.reason,
          matchingSkills: res.matchingSkills,
          missingSkills: res.missingSkills,
          experienceFit: toExperienceFit[res.experienceFit],
        },
      });
      summary.aiScored++;
    }
  } catch (err) {
    // AI scoring is an enhancement — the feed still works from stage-1 scores.
    summary.aiSkippedReason = err instanceof AppError ? err.message : "AI scoring failed";
    log.warn("stage2_failed", { userId, message: (err as Error).message });
  }
  return summary;
}
