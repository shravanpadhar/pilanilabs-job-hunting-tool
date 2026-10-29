export type UrlKind =
  | { kind: "greenhouse"; slug: string; jobId: string }
  | { kind: "lever"; slug: string; jobId: string }
  | { kind: "ashby"; slug: string; jobId: string }
  | { kind: "workable"; slug: string; shortcode: string }
  | { kind: "linkedin" | "indeed" }
  | { kind: "generic" };

const SLUG = /^[a-z0-9][a-z0-9_-]{0,60}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Decide how a pasted link must be read. Known career systems use their public APIs (fixed hosts, validated slugs
 * and ids). LinkedIn and Indeed are NEVER fetched. Everything else is read through the SSRF-guarded fetcher.
 */
export function classifyJobUrl(raw: string): UrlKind {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { kind: "generic" };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in") return { kind: "linkedin" };
  if (/(^|\.)indeed\.[a-z.]+$/.test(host)) return { kind: "indeed" };

  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host)) {
    const jobsIdx = parts.indexOf("jobs");
    const slug = (u.searchParams.get("for") ?? parts[0]) ?? "";
    const jobId = (jobsIdx >= 0 ? parts[jobsIdx + 1] : u.searchParams.get("gh_jid")) ?? "";
    if (SLUG.test(slug) && ID.test(jobId)) return { kind: "greenhouse", slug: slug.toLowerCase(), jobId };
  }
  if (host === "jobs.lever.co" && parts.length >= 2 && SLUG.test(parts[0]) && ID.test(parts[1])) {
    return { kind: "lever", slug: parts[0].toLowerCase(), jobId: parts[1] };
  }
  if (host === "jobs.ashbyhq.com" && parts.length >= 2 && SLUG.test(parts[0]) && ID.test(parts[1])) {
    return { kind: "ashby", slug: parts[0].toLowerCase(), jobId: parts[1] };
  }
  if (host === "apply.workable.com" && parts.length >= 3 && parts[1] === "j" && SLUG.test(parts[0]) && ID.test(parts[2])) {
    return { kind: "workable", slug: parts[0].toLowerCase(), shortcode: parts[2] };
  }
  return { kind: "generic" };
}

/** Hosts that are applicant-tracking systems or aggregators: their domain is NOT the employer's own domain. */
const NOT_EMPLOYER_HOST = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|linkedin\.com|indeed\.|smartrecruiters\.com|myworkdayjobs\.com|icims\.com|jobvite\.com|naukri\.com|glassdoor\.|wellfound\.com|angel\.co)/i;

export function employerDomainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (NOT_EMPLOYER_HOST.test(host)) return null;
    // "careers.acme.com" / "jobs.acme.com" -> "acme.com"
    return host.replace(/^(careers|jobs|apply|work)\./, "");
  } catch {
    return null;
  }
}
