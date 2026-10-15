import { fetchJson } from "@/lib/http";
import { cleanHtml, htmlToPlain, mapEmploymentType, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/** Arbeitnow — https://www.arbeitnow.com/api/job-board-api  (free, no key, paginated, Europe-heavy, many remote). */
interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

const PAGES = 2;

export const arbeitnow: JobSourceConnector = {
  name: "arbeitnow",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    for (let page = 1; page <= PAGES; page++) {
      const data = await fetchJson<{ data?: ArbeitnowJob[] }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of data.data ?? []) {
        const url = safeUrl(j.url);
        if (!url || !j.title || !j.company_name) continue;
        out.push({
          source: "arbeitnow",
          externalId: j.slug,
          title: j.title.trim(),
          company: j.company_name.trim(),
          location: j.location || (j.remote ? "Remote" : null),
          country: null,
          isRemote: Boolean(j.remote),
          employmentType: mapEmploymentType(j.job_types),
          descriptionHtml: j.description ? cleanHtml(j.description) : null,
          descriptionText: j.description ? htmlToPlain(j.description) : "",
          postedAt: safeDate(j.created_at),
          applyUrl: url,
          publisher: null,
          attributionUrl: null,
          isDirect: false,
        });
      }
      if (!data.data?.length) break;
    }
    return out;
  },
};
