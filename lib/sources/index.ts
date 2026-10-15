import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { daysAgo, mapLimit } from "@/lib/utils";
import { adzuna } from "@/lib/sources/adzuna";
import { arbeitnow } from "@/lib/sources/arbeitnow";
import { ashby } from "@/lib/sources/ashby";
import { greenhouse } from "@/lib/sources/greenhouse";
import { jobicy } from "@/lib/sources/jobicy";
import { jsearch } from "@/lib/sources/jsearch";
import { lever } from "@/lib/sources/lever";
import { remoteok } from "@/lib/sources/remoteok";
import { remotive } from "@/lib/sources/remotive";
import type { JobQuery, JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/** Register new connectors here — see ARCHITECTURE.md → "Adding a job source". */
export const CONNECTORS: JobSourceConnector[] = [jsearch, adzuna, remotive, remoteok, arbeitnow, jobicy, greenhouse, lever, ashby];

export interface SourceReport {
  source: string;
  enabled: boolean;
  fetched: number;
  error?: string;
  ms: number;
}

/** Jobs older than this are not worth storing. */
const MAX_AGE_DAYS = 30;
const MAX_SEARCH_QUERIES_PER_SOURCE = 8;

function isUsable(j: NormalizedJob): boolean {
  return Boolean(j.title && j.company && j.applyUrl && j.postedAt >= daysAgo(MAX_AGE_DAYS) && j.postedAt <= new Date(Date.now() + 86_400_000));
}

async function runConnector(c: JobSourceConnector, queries: JobQuery[]): Promise<{ jobs: NormalizedJob[]; report: SourceReport }> {
  const started = Date.now();
  if (!c.isEnabled()) return { jobs: [], report: { source: c.name, enabled: false, fetched: 0, ms: 0 } };

  const calls = c.mode === "search" ? queries.slice(0, MAX_SEARCH_QUERIES_PER_SOURCE) : queries.slice(0, 1);
  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  // Search connectors run queries one after another to respect provider rate limits.
  for (const q of calls) {
    try {
      jobs.push(...(await c.fetchJobs(q)));
    } catch (err) {
      const message = (err as Error).message;
      errors.push(message);
      log.error("source_failed", err, { source: c.name, query: q.keywords });
    }
  }
  const usable = jobs.filter(isUsable);
  return {
    jobs: usable,
    report: {
      source: c.name,
      enabled: true,
      fetched: usable.length,
      error: errors.length ? Array.from(new Set(errors)).join("; ") : undefined,
      ms: Date.now() - started,
    },
  };
}

/** Fetch from every enabled source. One failing source never stops the others. */
export async function fetchAllSources(queries: JobQuery[], only?: string[]): Promise<{ jobs: NormalizedJob[]; reports: SourceReport[] }> {
  const connectors = CONNECTORS.filter((c) => !only || only.includes(c.name));
  const results = await mapLimit(connectors, 4, (c) => runConnector(c, queries));
  const jobs: NormalizedJob[] = [];
  const reports: SourceReport[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobs.push(...r.value.jobs);
      reports.push(r.value.report);
    } else {
      reports.push({ source: connectors[i].name, enabled: true, fetched: 0, error: (r.reason as Error).message, ms: 0 });
    }
  });

  // Persist a lightweight run log (best effort).
  try {
    await db.fetchRun.createMany({
      data: reports
        .filter((r) => r.enabled)
        .map((r) => ({ source: r.source, finishedAt: new Date(), fetched: r.fetched, error: r.error ?? null })),
    });
  } catch {
    /* logging must never break a fetch */
  }
  return { jobs, reports };
}
