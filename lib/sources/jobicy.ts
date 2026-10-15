import { fetchJson } from "@/lib/http";
import { cleanHtml, htmlToPlain, mapEmploymentType, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * Jobicy — https://jobicy.com/api/v2/remote-jobs  (free, no key).
 * Terms (friendlyNotice): credit Jobicy with a direct link and send applicants to the job URL in the feed.
 * They ask for at most ~1 request/hour. `geo` only accepts predefined slugs, so we fetch the global feed.
 */
interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  companyLogo?: string | null;
  jobType?: string[];
  jobGeo?: string;
  jobDescription?: string;
  jobExcerpt?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

export const jobicy: JobSourceConnector = {
  name: "jobicy",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const data = await fetchJson<{ jobs?: JobicyJob[] }>("https://jobicy.com/api/v2/remote-jobs?count=100");
    const out: NormalizedJob[] = [];
    for (const j of data.jobs ?? []) {
      const url = safeUrl(j.url);
      if (!url || !j.jobTitle || !j.companyName) continue;
      const html = j.jobDescription || j.jobExcerpt || "";
      const period = j.salaryPeriod?.toLowerCase();
      const mult = period === "monthly" ? 12 : period === "hourly" ? 2080 : period === "weekly" ? 52 : 1;
      out.push({
        source: "jobicy",
        externalId: String(j.id),
        title: j.jobTitle.trim(),
        company: j.companyName.trim(),
        companyLogoUrl: safeUrl(j.companyLogo),
        location: j.jobGeo || "Remote",
        country: null,
        isRemote: true,
        employmentType: mapEmploymentType(j.jobType),
        salaryMin: j.salaryMin ? Math.round(j.salaryMin * mult) : null,
        salaryMax: j.salaryMax ? Math.round(j.salaryMax * mult) : null,
        salaryCurrency: j.salaryMin || j.salaryMax ? (j.salaryCurrency ?? null) : null,
        descriptionHtml: html ? cleanHtml(html) : null,
        descriptionText: html ? htmlToPlain(html) : "",
        postedAt: safeDate(j.pubDate),
        applyUrl: url,
        publisher: null,
        attributionUrl: url,
        isDirect: false,
      });
    }
    return out;
  },
};
