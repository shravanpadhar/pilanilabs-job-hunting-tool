import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { fetchAllSources, type SourceReport } from "@/lib/sources";
import type { JobQuery } from "@/lib/sources/types";
import { ingestJobs, purgeStaleJobs, type IngestResult } from "@/lib/jobs/ingest";

const DEFAULT_ROLES = ["software engineer", "product manager", "data analyst", "ui ux designer", "digital marketing", "operations manager"];

/** Build search queries from what real users are looking for (falls back to broad defaults). */
export async function buildQueries(postedWithinDays = 14): Promise<JobQuery[]> {
  const prefs = await db.preferences.findMany({ select: { targetRoles: true, locations: true, workModes: true } });
  const wanted = new Map<string, JobQuery>();
  for (const p of prefs) {
    const roles = p.targetRoles.slice(0, 3);
    const locations = p.locations.length ? p.locations.slice(0, 2) : [undefined];
    for (const role of roles) {
      for (const location of locations) {
        const key = `${role.toLowerCase()}|${(location ?? "").toLowerCase()}`;
        if (!wanted.has(key)) {
          wanted.set(key, { keywords: role, location, country: "in", postedWithinDays, remoteOnly: p.workModes.length === 1 && p.workModes[0] === "REMOTE" });
        }
      }
    }
  }
  const queries = Array.from(wanted.values());
  // Always include a few broad queries so the feed is never empty for new users.
  for (const role of DEFAULT_ROLES) {
    if (queries.length >= 8) break;
    if (![...wanted.keys()].some((k) => k.startsWith(role))) queries.push({ keywords: role, country: "in", postedWithinDays });
  }
  return queries.slice(0, 12);
}

export interface RefreshSummary {
  reports: SourceReport[];
  ingest: IngestResult;
  purged: number;
  ms: number;
}

/** Fetch every enabled source, dedupe, store. Used by the cron route and `npm run fetch-jobs`. */
export async function refreshJobs(opts: { only?: string[]; postedWithinDays?: number } = {}): Promise<RefreshSummary> {
  const started = Date.now();
  const queries = await buildQueries(opts.postedWithinDays ?? 14);
  const { jobs, reports } = await fetchAllSources(queries, opts.only);
  const ingest = await ingestJobs(jobs);
  const purged = opts.only ? 0 : await purgeStaleJobs();
  const summary = { reports, ingest, purged, ms: Date.now() - started };
  log.info("jobs_refreshed", { ...ingest, purged, ms: summary.ms, sources: reports.map((r) => `${r.source}:${r.enabled ? r.fetched : "off"}`).join(",") });
  return summary;
}
