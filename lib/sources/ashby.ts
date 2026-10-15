import { fetchJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { mapLimit } from "@/lib/utils";
import { listBoards, type BoardRef } from "@/lib/sources/boards";
import { annualize, cleanHtml, countryFromText, htmlToPlain, looksRemote, mapEmploymentType, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * Ashby public Job Postings API (no key): https://developers.ashbyhq.com/docs/public-job-posting-api
 * GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true
 */
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  address?: { postalAddress?: { addressCountry?: string } };
  compensation?: {
    summaryComponents?: Array<{ compensationType?: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number }>;
  };
}

export async function fetchAshbyBoard(board: Pick<BoardRef, "slug" | "name">): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}?includeCompensation=true`,
    { timeoutMs: 40_000 },
  );
  const out: NormalizedJob[] = [];
  for (const j of data.jobs ?? []) {
    if (j.isListed === false) continue;
    const applyUrl = safeUrl(j.jobUrl) ?? safeUrl(j.applyUrl);
    if (!applyUrl || !j.title) continue;
    const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary" && (c.minValue || c.maxValue));
    const location = j.location ?? null;
    out.push({
      source: "ashby",
      externalId: `${board.slug}:${j.id}`,
      title: j.title.trim(),
      company: board.name,
      location,
      country: countryFromText(j.address?.postalAddress?.addressCountry) ?? countryFromText(location),
      isRemote: Boolean(j.isRemote) || j.workplaceType === "Remote" || looksRemote(location),
      employmentType: mapEmploymentType(j.employmentType),
      salaryMin: annualize(salary?.minValue, salary?.interval),
      salaryMax: annualize(salary?.maxValue, salary?.interval),
      salaryCurrency: salary ? (salary.currencyCode ?? null) : null,
      descriptionHtml: j.descriptionHtml ? cleanHtml(j.descriptionHtml) : null,
      descriptionText: j.descriptionHtml ? htmlToPlain(j.descriptionHtml) : (j.descriptionPlain ?? ""),
      postedAt: safeDate(j.publishedAt),
      applyUrl,
      publisher: board.name,
      attributionUrl: null,
      isDirect: true,
    });
  }
  return out;
}

export const ashby: JobSourceConnector = {
  name: "ashby",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const boards = await listBoards("ashby");
    const results = await mapLimit(boards, 4, (b) => fetchAshbyBoard(b));
    return results.flatMap((r, i) => {
      if (r.status === "fulfilled") return r.value;
      log.warn("board_fetch_failed", { source: "ashby", board: boards[i].slug, message: (r.reason as Error).message });
      return [];
    });
  },
};
