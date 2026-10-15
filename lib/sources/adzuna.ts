import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { CURRENCY_BY_COUNTRY, cleanHtml, looksRemote, mapEmploymentType, plainToHtml, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobQuery, JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * Adzuna — https://developer.adzuna.com/docs/search
 * GET /v1/api/jobs/{country}/search/{page}. Descriptions are truncated snippets, and Adzuna's terms
 * require attribution ("Jobs by Adzuna") — we show the source on every card and link back via redirect_url.
 */
interface AdzunaJob {
  id: string;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  contract_time?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
}

const SUPPORTED = new Set(["in", "gb", "us", "au", "ca", "sg", "de", "fr", "nl", "at", "pl", "za", "nz", "br"]);

export const adzuna: JobSourceConnector = {
  name: "adzuna",
  mode: "search",
  isEnabled: () => Boolean(env.adzunaAppId && env.adzunaAppKey),
  async fetchJobs(q: JobQuery): Promise<NormalizedJob[]> {
    const country = SUPPORTED.has(q.country ?? "in") ? (q.country ?? "in") : "in";
    const params = new URLSearchParams({
      app_id: env.adzunaAppId!,
      app_key: env.adzunaAppKey!,
      results_per_page: "50",
      what: q.keywords,
      max_days_old: String(q.postedWithinDays),
      sort_by: "date",
      "content-type": "application/json",
    });
    if (q.location) params.set("where", q.location);

    const data = await fetchJson<{ results?: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
    const out: NormalizedJob[] = [];
    for (const j of data.results ?? []) {
      const applyUrl = safeUrl(j.redirect_url);
      const company = j.company?.display_name?.trim();
      if (!j.id || !j.title || !company || !applyUrl) continue;
      const location = j.location?.display_name ?? null;
      const text = (j.description ?? "").replace(/\s+/g, " ").trim();
      out.push({
        source: "adzuna",
        externalId: String(j.id),
        title: j.title.replace(/<\/?strong>/g, "").trim(),
        company,
        location,
        country,
        isRemote: looksRemote(j.title, location, text.slice(0, 300)),
        employmentType: mapEmploymentType([j.contract_time, j.contract_type].filter(Boolean) as string[]),
        salaryMin: j.salary_min ? Math.round(j.salary_min) : null,
        salaryMax: j.salary_max ? Math.round(j.salary_max) : null,
        salaryCurrency: j.salary_min || j.salary_max ? (CURRENCY_BY_COUNTRY[country] ?? null) : null,
        descriptionHtml: text ? cleanHtml(plainToHtml(text)) : null,
        descriptionText: text,
        postedAt: safeDate(j.created),
        applyUrl,
        publisher: null,
        attributionUrl: "https://www.adzuna.in",
        isDirect: false,
      });
    }
    return out;
  },
};
