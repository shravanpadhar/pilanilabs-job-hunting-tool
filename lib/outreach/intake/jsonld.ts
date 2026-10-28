import { htmlToPlain } from "@/lib/sources/normalize";
import type { ExtractedJob } from "@/lib/outreach/intake/types";

/** Pulls a schema.org JobPosting out of a page's <script type="application/ld+json"> blocks. Pure and offline. */
function blocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      /* ignore malformed block */
    }
  }
  return out;
}

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    yield o;
    if (o["@graph"]) yield* walk(o["@graph"]);
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function locationOf(v: unknown): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  if (!first || typeof first !== "object") return str(first);
  const addr = (first as Record<string, unknown>).address;
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const country = typeof a.addressCountry === "object" && a.addressCountry ? str((a.addressCountry as Record<string, unknown>).name) : str(a.addressCountry);
    return [str(a.addressLocality), str(a.addressRegion), country].filter(Boolean).join(", ") || null;
  }
  return null;
}

export function parseJobPostingJsonLd(html: string, sourceUrl: string | null): ExtractedJob | null {
  for (const block of blocks(html)) {
    for (const o of walk(block)) {
      const type = o["@type"];
      const isJob = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      if (!isJob) continue;
      const title = str(o.title);
      const org = o.hiringOrganization;
      const company = typeof org === "string" ? org : org && typeof org === "object" ? str((org as Record<string, unknown>).name) : null;
      const rawDesc = str(o.description);
      if (!title || !company || !rawDesc) continue;
      const description = /<[a-z][\s\S]*>/i.test(rawDesc) ? htmlToPlain(rawDesc) : rawDesc;
      const requirements = description
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => /^[-•*]\s+/.test(l))
        .map((l) => l.replace(/^[-•*]\s+/, ""))
        .slice(0, 20);
      return { title, company, location: locationOf(o.jobLocation), description: description.slice(0, 20_000), requirements, sourceUrl, applyUrl: str(o.url) ?? sourceUrl, source: "jsonld" };
    }
  }
  return null;
}
