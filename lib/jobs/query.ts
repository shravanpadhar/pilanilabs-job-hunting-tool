import { AGGREGATOR_SOURCES } from "@/config/companies";
import { limits } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { JobFilters } from "@/lib/jobs/filters";
import { daysAgo } from "@/lib/utils";

export const jobCardSelect = {
  id: true,
  title: true,
  company: true,
  companySlug: true,
  companyLogoUrl: true,
  location: true,
  isRemote: true,
  employmentType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  postedAt: true,
  source: true,
  publisher: true,
  applyUrl: true,
  isDirect: true,
  sourcesSeen: true,
} satisfies Prisma.JobSelect;

export type JobCardData = Prisma.JobGetPayload<{ select: typeof jobCardSelect }>;

export interface MatchSummary {
  score: number;
  reason: string;
  aiScored: boolean;
  matchingSkills: string[];
  missingSkills: string[];
  experienceFit: "UNDER" | "FIT" | "OVER" | null;
}

export interface FeedItem {
  job: JobCardData;
  match: MatchSummary | null;
  /** The user has this job in their tracker. */
  saved?: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

function contains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

/** Job-level filters shared by the matched feed, Hidden jobs and saved searches. */
export function buildJobWhere(f: JobFilters): Prisma.JobWhereInput {
  // ownerUserId: null keeps user-private jobs (pasted outreach links) out of every shared feed.
  const and: Prisma.JobWhereInput[] = [{ ownerUserId: null }, { postedAt: { gte: daysAgo(f.postedWithin ?? 14) } }];
  if (f.q) {
    const terms = f.q.split(/\s+/).filter(Boolean).slice(0, 5);
    for (const t of terms) and.push({ OR: [{ title: contains(t) }, { company: contains(t) }, { descriptionText: contains(t) }] });
  }
  if (f.location) {
    and.push({ OR: [{ location: contains(f.location) }, ...(f.location.toLowerCase() === "remote" ? [{ isRemote: true }] : [])] });
  }
  if (f.workMode === "remote") and.push({ isRemote: true });
  if (f.workMode === "onsite") and.push({ isRemote: false });
  if (f.minSalary) and.push({ OR: [{ salaryMax: { gte: f.minSalary } }, { salaryMin: { gte: f.minSalary } }] });
  if (f.employmentType) and.push({ employmentType: f.employmentType });
  if (f.source) and.push({ OR: [{ source: f.source }, { sourcesSeen: { has: f.source } }] });
  return { AND: and };
}

const matchSelect = { score: true, reason: true, aiScored: true, matchingSkills: true, missingSkills: true, experienceFit: true } as const;

/** The ranked feed: jobs the matching engine scored for this user. */
export async function queryMatchedFeed(userId: string, f: JobFilters, page = 1, pageSize = limits.feedPageSize): Promise<FeedPage> {
  const where: Prisma.MatchWhereInput = {
    userId,
    job: buildJobWhere(f),
    ...(f.minScore ? { score: { gte: f.minScore } } : {}),
  };
  const sort = f.sort ?? "match";
  const orderBy: Prisma.MatchOrderByWithRelationInput[] =
    sort === "newest"
      ? [{ job: { postedAt: "desc" } }, { score: "desc" }]
      : sort === "salary"
        ? [{ job: { salaryMax: { sort: "desc", nulls: "last" } } }, { score: "desc" }]
        : [{ score: "desc" }, { job: { postedAt: "desc" } }];

  const [total, rows] = await Promise.all([
    db.match.count({ where }),
    db.match.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: { ...matchSelect, job: { select: jobCardSelect } } }),
  ]);
  return {
    items: rows.map(({ job, ...m }) => ({ job, match: m })),
    total,
    page,
    hasMore: page * pageSize < total,
  };
}

/** Mark which feed items the user already saved / applied to. */
export async function attachSaved(userId: string, page: FeedPage): Promise<FeedPage> {
  if (page.items.length === 0) return page;
  const rows = await db.application.findMany({ where: { userId, jobId: { in: page.items.map((i) => i.job.id) } }, select: { jobId: true } });
  const ids = new Set(rows.map((r) => r.jobId));
  return { ...page, items: page.items.map((i) => ({ ...i, saved: ids.has(i.job.id) })) };
}

/** Jobs only present on company career pages (never seen on an aggregator). */
export const hiddenJobWhere: Prisma.JobWhereInput = {
  isDirect: true,
  NOT: { sourcesSeen: { hasSome: [...AGGREGATOR_SOURCES] } },
};

/** All jobs matching filters (not limited to the user's matches); used by Hidden jobs and saved searches. */
export async function queryJobs(
  userId: string,
  f: JobFilters,
  opts: { hiddenOnly?: boolean; page?: number; pageSize?: number; since?: Date } = {},
): Promise<FeedPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? limits.feedPageSize;
  const where: Prisma.JobWhereInput = {
    AND: [buildJobWhere(f), ...(opts.hiddenOnly ? [hiddenJobWhere] : []), ...(opts.since ? [{ fetchedAt: { gt: opts.since } }] : [])],
  };
  const sort = f.sort ?? "newest";
  const orderBy: Prisma.JobOrderByWithRelationInput[] =
    sort === "salary" ? [{ salaryMax: { sort: "desc", nulls: "last" } }, { postedAt: "desc" }] : [{ postedAt: "desc" }];

  const [total, rows] = await Promise.all([
    db.job.count({ where }),
    db.job.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { ...jobCardSelect, matches: { where: { userId }, take: 1, select: matchSelect } },
    }),
  ]);
  let items: FeedItem[] = rows.map(({ matches, ...job }) => ({ job, match: matches[0] ?? null }));
  if (f.minScore) items = items.filter((i) => (i.match?.score ?? 0) >= f.minScore!);
  if (sort === "match") items.sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
  return { items, total, page, hasMore: page * pageSize < total };
}
