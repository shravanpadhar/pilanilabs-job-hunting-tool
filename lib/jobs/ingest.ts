import { Prisma } from "@/generated/prisma/client";
import { slugifyCompany } from "@/lib/companies/slug";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { extractSkills } from "@/lib/matching/text";
import { chunk, daysAgo } from "@/lib/utils";
import { completeness, mergeDuplicates } from "@/lib/sources/dedupe";
import { sanitizeSalary } from "@/lib/sources/normalize";
import type { NormalizedJob } from "@/lib/sources/types";

export interface IngestResult {
  received: number;
  unique: number;
  inserted: number;
  updated: number;
}

function toCreateData(j: NormalizedJob & { dedupeHash: string; sourcesSeen: string[] }): Prisma.JobCreateManyInput {
  const salary = sanitizeSalary(j.salaryMin, j.salaryMax);
  return {
    source: j.source,
    externalId: j.externalId,
    title: j.title.slice(0, 300),
    company: j.company.slice(0, 200),
    companySlug: slugifyCompany(j.company),
    companyLogoUrl: j.companyLogoUrl ?? null,
    location: j.location?.slice(0, 300) ?? null,
    country: j.country ?? null,
    isRemote: j.isRemote,
    employmentType: j.employmentType ?? null,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.min || salary.max ? (j.salaryCurrency ?? null) : null,
    descriptionHtml: j.descriptionHtml ?? null,
    descriptionText: j.descriptionText,
    postedAt: j.postedAt,
    applyUrl: j.applyUrl,
    publisher: j.publisher ?? null,
    attributionUrl: j.attributionUrl ?? null,
    dedupeHash: j.dedupeHash,
    sourcesSeen: j.sourcesSeen,
    skills: extractSkills(`${j.title}\n${j.descriptionText}`),
    isDirect: j.isDirect,
  };
}

/**
 * Deduplicate and upsert jobs. A job seen again keeps whichever record is more complete
 * and remembers every source that listed it (drives the "Hidden jobs" feed).
 */
export async function ingestJobs(jobs: NormalizedJob[]): Promise<IngestResult> {
  const unique = mergeDuplicates(jobs);
  let inserted = 0;
  let updated = 0;

  for (const batch of chunk(unique, 500)) {
    const existing = await db.job.findMany({ where: { dedupeHash: { in: batch.map((b) => b.dedupeHash) } } });
    const byHash = new Map(existing.map((e) => [e.dedupeHash, e]));

    const toCreate: Prisma.JobCreateManyInput[] = [];
    const toTouch: string[] = [];
    const toUpdate: Array<{ id: string; data: Prisma.JobUpdateInput }> = [];

    for (const j of batch) {
      const cur = byHash.get(j.dedupeHash);
      if (!cur) {
        toCreate.push(toCreateData(j));
        continue;
      }
      const sources = Array.from(new Set([...cur.sourcesSeen, ...j.sourcesSeen]));
      const better = completeness(j) > completeness(cur);
      const sourcesChanged = sources.length !== cur.sourcesSeen.length;
      if (!better && !sourcesChanged) {
        toTouch.push(cur.id);
        continue;
      }
      const data: Prisma.JobUpdateInput = { sourcesSeen: sources, fetchedAt: new Date(), isDirect: cur.isDirect || j.isDirect };
      if (better) Object.assign(data, toCreateData(j), { sourcesSeen: sources, isDirect: cur.isDirect || j.isDirect });
      toUpdate.push({ id: cur.id, data });
    }

    if (toCreate.length) {
      const res = await db.job.createMany({ data: toCreate, skipDuplicates: true });
      inserted += res.count;
    }
    if (toTouch.length) await db.job.updateMany({ where: { id: { in: toTouch } }, data: { fetchedAt: new Date() } });
    for (const u of toUpdate) {
      try {
        await db.job.update({ where: { id: u.id }, data: u.data });
        updated++;
      } catch (err) {
        log.warn("job_update_failed", { id: u.id, message: (err as Error).message });
      }
    }
    updated += toTouch.length;
  }

  return { received: jobs.length, unique: unique.length, inserted, updated };
}

/** Remove stale jobs nobody is tracking (not seen for `days`). Seed rows are kept. */
export async function purgeStaleJobs(days = 45): Promise<number> {
  const res = await db.job.deleteMany({
    where: { ownerUserId: null, fetchedAt: { lt: daysAgo(days) }, isSeed: false, applications: { none: {} } },
  });
  return res.count;
}
