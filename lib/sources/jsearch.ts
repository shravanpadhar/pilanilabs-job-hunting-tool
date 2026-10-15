import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { annualize, cleanHtml, htmlToPlain, mapEmploymentType, plainToHtml, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobQuery, JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * JSearch (RapidAPI) — aggregates Google for Jobs (LinkedIn, Naukri, Indeed, Glassdoor, company sites).
 * Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch  ·  GET /search
 * Free tier is small (hundreds of requests / month) — keep one page per query.
 */
interface JSearchJob {
  job_id: string;
  employer_name?: string;
  employer_logo?: string | null;
  job_publisher?: string | null;
  job_employment_type?: string | null;
  job_employment_types?: string[] | null;
  job_title?: string;
  job_apply_link?: string;
  job_description?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
}

const datePosted = (days: number) => (days <= 1 ? "today" : days <= 3 ? "3days" : days <= 7 ? "week" : "month");

export const jsearch: JobSourceConnector = {
  name: "jsearch",
  mode: "search",
  isEnabled: () => Boolean(env.rapidApiKey),
  async fetchJobs(q: JobQuery): Promise<NormalizedJob[]> {
    const country = q.country ?? "in";
    const query = [q.keywords, q.location ? `in ${q.location}` : ""].filter(Boolean).join(" ");
    const params = new URLSearchParams({
      query,
      page: "1",
      num_pages: "1",
      date_posted: datePosted(q.postedWithinDays),
      country,
    });
    if (q.remoteOnly) params.set("work_from_home", "true");

    const data = await fetchJson<{ data?: JSearchJob[] }>(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: { "X-RapidAPI-Key": env.rapidApiKey!, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    });

    const out: NormalizedJob[] = [];
    for (const j of data.data ?? []) {
      const applyUrl = safeUrl(j.job_apply_link);
      if (!j.job_id || !j.job_title || !j.employer_name || !applyUrl) continue;
      const html = j.job_description ? cleanHtml(plainToHtml(j.job_description)) : null;
      out.push({
        source: "jsearch",
        externalId: j.job_id,
        title: j.job_title.trim(),
        company: j.employer_name.trim(),
        companyLogoUrl: safeUrl(j.employer_logo),
        location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || null,
        country: j.job_country?.length === 2 ? j.job_country.toLowerCase() : null,
        isRemote: Boolean(j.job_is_remote),
        employmentType: mapEmploymentType(j.job_employment_types ?? j.job_employment_type),
        salaryMin: annualize(j.job_min_salary, j.job_salary_period),
        salaryMax: annualize(j.job_max_salary, j.job_salary_period),
        salaryCurrency: j.job_salary_currency ?? null,
        descriptionHtml: html,
        descriptionText: j.job_description ? htmlToPlain(j.job_description) : "",
        postedAt: safeDate(j.job_posted_at_datetime_utc),
        applyUrl,
        publisher: j.job_publisher ?? null,
        attributionUrl: null,
        isDirect: false,
      });
    }
    return out;
  },
};
