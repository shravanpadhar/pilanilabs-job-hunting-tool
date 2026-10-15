import { fetchJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { mapLimit } from "@/lib/utils";
import { listBoards, type BoardRef } from "@/lib/sources/boards";
import { cleanHtml, countryFromText, decodeEscapedHtml, htmlToPlain, looksRemote, safeDate, safeUrl } from "@/lib/sources/normalize";
import type { JobSourceConnector, NormalizedJob } from "@/lib/sources/types";

/**
 * Greenhouse public Job Board API (no key): https://developers.greenhouse.io/job-board.html
 * GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true
 */
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  first_published?: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
  company_name?: string;
  pay_input_ranges?: Array<{ min_cents?: number; max_cents?: number; currency_type?: string }>;
}

export async function fetchGreenhouseBoard(board: Pick<BoardRef, "slug" | "name">): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs?content=true&pay_transparency=true`,
    { timeoutMs: 60_000 },
  );
  const out: NormalizedJob[] = [];
  for (const j of data.jobs ?? []) {
    const applyUrl = safeUrl(j.absolute_url);
    if (!applyUrl || !j.title) continue;
    const rawHtml = j.content ? decodeEscapedHtml(j.content) : "";
    const location = j.location?.name?.trim() || null;
    const pay = j.pay_input_ranges?.find((p) => p.min_cents || p.max_cents);
    out.push({
      source: "greenhouse",
      externalId: `${board.slug}:${j.id}`,
      title: j.title.trim(),
      company: board.name,
      location,
      country: countryFromText(location),
      isRemote: looksRemote(location, j.title),
      employmentType: null,
      salaryMin: pay?.min_cents ? Math.round(pay.min_cents / 100) : null,
      salaryMax: pay?.max_cents ? Math.round(pay.max_cents / 100) : null,
      salaryCurrency: pay ? (pay.currency_type ?? null) : null,
      descriptionHtml: rawHtml ? cleanHtml(rawHtml) : null,
      descriptionText: rawHtml ? htmlToPlain(rawHtml) : "",
      postedAt: safeDate(j.first_published ?? j.updated_at),
      applyUrl,
      publisher: board.name,
      attributionUrl: null,
      isDirect: true,
    });
  }
  return out;
}

export const greenhouse: JobSourceConnector = {
  name: "greenhouse",
  mode: "feed",
  isEnabled: () => true,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const boards = await listBoards("greenhouse");
    const results = await mapLimit(boards, 4, (b) => fetchGreenhouseBoard(b));
    return results.flatMap((r, i) => {
      if (r.status === "fulfilled") return r.value;
      log.warn("board_fetch_failed", { source: "greenhouse", board: boards[i].slug, message: (r.reason as Error).message });
      return [];
    });
  },
};
