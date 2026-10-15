import type { AtsProviderName } from "@/config/companies";

export interface ParsedBoard {
  provider: AtsProviderName;
  slug: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,60}$/i;

/**
 * Recognise a company's public career-page URL on Greenhouse, Lever or Ashby, or a bare "provider:slug".
 *   https://boards.greenhouse.io/acme · https://job-boards.greenhouse.io/acme/jobs/123
 *   https://jobs.lever.co/acme · https://jobs.ashbyhq.com/acme/…
 */
export function parseBoardUrl(input: string): ParsedBoard | null {
  const raw = input.trim();
  const short = raw.match(/^(greenhouse|lever|ashby)\s*[:/]\s*([a-z0-9_-]+)$/i);
  if (short) return SLUG_RE.test(short[2]) ? { provider: short[1].toLowerCase() as AtsProviderName, slug: short[2].toLowerCase() } : null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const first = url.pathname.split("/").filter(Boolean)[0];
  const forGreenhouse = host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "boards.eu.greenhouse.io" || host === "job-boards.eu.greenhouse.io";
  const provider: AtsProviderName | null = forGreenhouse ? "greenhouse" : host === "jobs.lever.co" ? "lever" : host === "jobs.ashbyhq.com" ? "ashby" : null;
  if (!provider) return null;
  const slug = (provider === "greenhouse" ? (url.searchParams.get("for") ?? first) : first)?.toLowerCase();
  return slug && SLUG_RE.test(slug) ? { provider, slug } : null;
}

export function prettifySlug(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
