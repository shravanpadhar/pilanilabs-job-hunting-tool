import { fetchJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { mapLimit } from "@/lib/utils";
import { listBoards, type BoardRef } from "@/lib/sources/boards";
import { annualize, cleanHtml, countryFromText, htmlToPlain, looksRemote, mapEmploymentType, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * Lever public Postings API (no key): https://github.com/lever/postings-api
 * GET https://api.lever.co/v0/postings/{site}?mode=json
 */
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  country?: string;
  workplaceType?: string;
  categories?: { commitment?: string; location?: string; allLocations?: string[] };
  salaryRange?: { currency?: string; interval?: string; min?: number; max?: number };
}

export async function fetchLeverBoard(board: Pick<BoardRef, "slug" | "name">): Promise<NormalizedJob[]> {
  const data = await fetchJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(board.slug)}?mode=json`, { timeoutMs: 40_000 });
  const out: NormalizedJob[] = [];
  for (const p of Array.isArray(data) ? data : []) {
    const applyUrl = safeUrl(p.applyUrl) ?? safeUrl(p.hostedUrl);
    if (!applyUrl || !p.text) continue;
    const location = p.categories?.location ?? p.categories?.allLocations?.[0] ?? null;
    const listsHtml = (p.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join("");
    const html = [p.description, listsHtml, p.additional].filter(Boolean).join("");
    const sr = p.salaryRange;
    const interval = sr?.interval?.toLowerCase().includes("month") ? "month" : sr?.interval?.toLowerCase().includes("hour") ? "hour" : "year";
    out.push({
      source: "lever",
      externalId: `${board.slug}:${p.id}`,
      title: p.text.trim(),
      company: board.name,
      location,
      country: p.country ? p.country.toLowerCase() : countryFromText(location),
      isRemote: p.workplaceType === "remote" || looksRemote(location, p.text),
      employmentType: mapEmploymentType(p.categories?.commitment),
      salaryMin: annualize(sr?.min, interval),
      salaryMax: annualize(sr?.max, interval),
      salaryCurrency: sr?.min || sr?.max ? (sr?.currency ?? null) : null,
      descriptionHtml: html ? cleanHtml(html) : null,
      descriptionText: html ? htmlToPlain(html) : (p.descriptionPlain ?? ""),
      postedAt: safeDate(p.createdAt),
      applyUrl,
      publisher: board.name,
      attributionUrl: null,
      isDirect: true,
    });
  }
  return out;
}

export const lever: JobSourceConnector = {
  name: "lever",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const boards = await listBoards("lever");
    const results = await mapLimit(boards, 4, (b) => fetchLeverBoard(b));
    return results.flatMap((r, i) => {
      if (r.status === "fulfilled") return r.value;
      log.warn("board_fetch_failed", { source: "lever", board: boards[i].slug, message: (r.reason as Error).message });
      return [];
    });
  },
};
