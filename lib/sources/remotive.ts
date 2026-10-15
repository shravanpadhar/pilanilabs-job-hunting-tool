import { fetchJson } from "@/lib/http";
import { cleanHtml, htmlToPlain, mapEmploymentType, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * Remotive — https://remotive.com/api/remote-jobs  (free, no key).
 * Terms (from the API's legal notice): link back to the Remotive URL and name Remotive as the source;
 * jobs are delayed 24h; they ask for at most a few requests per day (our 6-hourly cron makes 4).
 * We therefore send users to the Remotive job URL as the apply link and show "via Remotive".
 */
interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string | null;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

/** "$35,3k- $52k" style strings are too irregular to trust; we only keep clean "$50,000 - $70,000" patterns. */
function parseRemotiveSalary(s?: string): { min: number | null; max: number | null; currency: string | null } {
  const empty = { min: null, max: null, currency: null };
  if (!s) return empty;
  const m = s.replace(/,/g, "").match(/([$€£])\s?(\d+(?:\.\d+)?)\s?(k)?\s*[-–to]+\s*[$€£]?\s?(\d+(?:\.\d+)?)\s?(k)?/i);
  if (!m) return empty;
  const mult = (k?: string) => (k ? 1000 : 1);
  const min = Math.round(Number(m[2]) * mult(m[3] ?? m[5]));
  const max = Math.round(Number(m[4]) * mult(m[5] ?? m[3]));
  if (!min || !max || min > max || min < 1000) return empty;
  return { min, max, currency: { "$": "USD", "€": "EUR", "£": "GBP" }[m[1]] ?? null };
}

export const remotive: JobSourceConnector = {
  name: "remotive",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const data = await fetchJson<{ jobs?: RemotiveJob[] }>("https://remotive.com/api/remote-jobs?limit=200");
    const out: NormalizedJob[] = [];
    for (const j of data.jobs ?? []) {
      const url = safeUrl(j.url);
      if (!url || !j.title || !j.company_name) continue;
      const sal = parseRemotiveSalary(j.salary);
      out.push({
        source: "remotive",
        externalId: String(j.id),
        title: j.title.trim(),
        company: j.company_name.trim(),
        companyLogoUrl: safeUrl(j.company_logo),
        location: j.candidate_required_location || "Remote",
        country: null,
        isRemote: true,
        employmentType: mapEmploymentType(j.job_type),
        salaryMin: sal.min,
        salaryMax: sal.max,
        salaryCurrency: sal.currency,
        descriptionHtml: j.description ? cleanHtml(j.description) : null,
        descriptionText: j.description ? htmlToPlain(j.description) : "",
        postedAt: safeDate(j.publication_date),
        applyUrl: url,
        publisher: null,
        attributionUrl: url,
        isDirect: false,
      });
    }
    return out;
  },
};
