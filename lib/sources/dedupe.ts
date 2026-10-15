import { sha256 } from "@/lib/utils";
import type { NormalizedJob } from "@/lib/sources/types";

const CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  "bengaluru urban": "bengaluru",
  gurgaon: "gurugram",
  bombay: "mumbai",
  madras: "chennai",
  calcutta: "kolkata",
  "new delhi": "delhi",
  "ncr": "delhi",
  "delhi ncr": "delhi",
  "navi mumbai": "mumbai",
  noida: "noida",
};

const COMPANY_NOISE = /\b(pvt|private|ltd|limited|inc|incorporated|llc|llp|corp|corporation|gmbh|technologies|technology|india|software|solutions|services)\b/g;

function base(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#./ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return base(title)
    .replace(/\((remote|hybrid|onsite|on-site|contract|full[- ]?time|part[- ]?time)[^)]*\)/g, " ")
    .replace(/\b(remote|hybrid|onsite|on site)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompany(company: string): string {
  // Drop dots first so "Pvt. Ltd." and "Pvt Ltd" normalise identically.
  return base(company).replace(/\./g, "").replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();
}

export function normalizeLocation(location: string | null | undefined, isRemote: boolean): string {
  if (isRemote && !location) return "remote";
  const first = base((location ?? "").split(",")[0] ?? "");
  if (!first) return isRemote ? "remote" : "";
  return CITY_ALIASES[first] ?? first;
}

/** sha256(normalize(title) + normalize(company) + normalize(location)) */
export function computeDedupeHash(job: Pick<NormalizedJob, "title" | "company" | "location" | "isRemote">): string {
  return sha256(`${normalizeTitle(job.title)}|${normalizeCompany(job.company)}|${normalizeLocation(job.location, job.isRemote)}`);
}

/** How much usable data a record carries — used to keep the best duplicate. */
export interface CompletenessInput {
  descriptionText?: string | null;
  descriptionHtml?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  location?: string | null;
  employmentType?: string | null;
  companyLogoUrl?: string | null;
  publisher?: string | null;
  isDirect?: boolean;
}

export function completeness(j: CompletenessInput): number {
  let score = 0;
  if (j.descriptionText) score += Math.min(40, Math.floor(j.descriptionText.length / 100));
  if (j.descriptionHtml) score += 5;
  if (j.salaryMin || j.salaryMax) score += 15;
  if (j.location) score += 5;
  if (j.employmentType) score += 3;
  if (j.companyLogoUrl) score += 3;
  if (j.publisher) score += 2;
  if (j.isDirect) score += 10; // company-hosted postings are the most reliable apply targets
  return score;
}

/** Merge duplicates, keeping the most complete record and remembering every source seen. */
export function mergeDuplicates(jobs: NormalizedJob[]): Array<NormalizedJob & { dedupeHash: string; sourcesSeen: string[] }> {
  const byHash = new Map<string, NormalizedJob & { dedupeHash: string; sourcesSeen: string[] }>();
  for (const job of jobs) {
    const hash = computeDedupeHash(job);
    const current = byHash.get(hash);
    if (!current) {
      byHash.set(hash, { ...job, dedupeHash: hash, sourcesSeen: [job.source] });
      continue;
    }
    const sources = Array.from(new Set([...current.sourcesSeen, job.source]));
    const winner = completeness(job) > completeness(current) ? job : current;
    byHash.set(hash, {
      ...winner,
      // Fill gaps in the winner from the loser.
      salaryMin: winner.salaryMin ?? current.salaryMin ?? job.salaryMin,
      salaryMax: winner.salaryMax ?? current.salaryMax ?? job.salaryMax,
      salaryCurrency: winner.salaryCurrency ?? current.salaryCurrency ?? job.salaryCurrency,
      publisher: winner.publisher ?? current.publisher ?? job.publisher,
      companyLogoUrl: winner.companyLogoUrl ?? current.companyLogoUrl ?? job.companyLogoUrl,
      isDirect: current.isDirect || job.isDirect,
      postedAt: current.postedAt < job.postedAt ? current.postedAt : job.postedAt,
      dedupeHash: hash,
      sourcesSeen: sources,
    });
  }
  return Array.from(byHash.values());
}
