import { fetchJson } from "@/lib/http";
import { cleanHtml, htmlToPlain, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * RemoteOK — https://remoteok.com/api  (free, no key).
 * Terms (first element of the response): link back to the RemoteOK URL with a followed link and name
 * "Remote OK" as the source. We use the RemoteOK job URL as the apply link and do not use their logo.
 */
interface RemoteOkJob {
  id?: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
}

export const remoteok: JobSourceConnector = {
  name: "remoteok",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
    const out: NormalizedJob[] = [];
    for (const j of data) {
      // First element is the legal notice object (no `position`).
      if (!j.position || !j.company || !j.id) continue;
      const url = safeUrl(j.url) ?? safeUrl(j.apply_url);
      if (!url) continue;
      const hasSalary = (j.salary_min ?? 0) > 0 || (j.salary_max ?? 0) > 0;
      out.push({
        source: "remoteok",
        externalId: String(j.id),
        title: j.position.trim(),
        company: j.company.trim(),
        companyLogoUrl: null,
        location: j.location?.trim() || "Remote",
        country: null,
        isRemote: true,
        employmentType: null,
        salaryMin: j.salary_min && j.salary_min > 0 ? j.salary_min : null,
        salaryMax: j.salary_max && j.salary_max > 0 ? j.salary_max : null,
        salaryCurrency: hasSalary ? "USD" : null,
        descriptionHtml: j.description ? cleanHtml(j.description) : null,
        descriptionText: j.description ? htmlToPlain(j.description) : (j.tags ?? []).join(", "),
        postedAt: safeDate(j.epoch ?? j.date),
        applyUrl: url,
        publisher: null,
        attributionUrl: url,
        isDirect: false,
      });
    }
    return out;
  },
};
