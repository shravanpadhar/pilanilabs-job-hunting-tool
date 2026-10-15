import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, handler } from "@/lib/errors";
import { fetchJson } from "@/lib/http";
import { ingestJobs } from "@/lib/jobs/ingest";
import { fetchAshbyBoard } from "@/lib/sources/ashby";
import { parseBoardUrl, prettifySlug } from "@/lib/sources/board-url";
import { fetchGreenhouseBoard } from "@/lib/sources/greenhouse";
import { fetchLeverBoard } from "@/lib/sources/lever";
import type { NormalizedJob } from "@/lib/sources/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({ url: z.string().trim().min(3).max(300), companyName: z.string().trim().max(80).optional() });
const MAX_USER_BOARDS = 15;

/** Add a company's Greenhouse / Lever / Ashby career page to the Hidden jobs sources. Only those three hosts are ever contacted. */
export const POST = handler("board_add", async (request: Request) => {
  const user = await requireUserApi();
  const { url, companyName } = bodySchema.parse(await request.json());

  const parsed = parseBoardUrl(url);
  if (!parsed) {
    throw new AppError("That doesn't look like a Greenhouse, Lever or Ashby career page. Try a link like https://boards.greenhouse.io/company or https://jobs.lever.co/company.", 400, "bad_board_url");
  }
  const provider = parsed.provider.toUpperCase() as "GREENHOUSE" | "LEVER" | "ASHBY";

  const existing = await db.companyBoard.findUnique({ where: { provider_slug: { provider, slug: parsed.slug } } });
  if (existing) return NextResponse.json({ board: existing, added: 0, message: "That career page is already being tracked." });

  if ((await db.companyBoard.count({ where: { addedByUserId: user.id } })) >= MAX_USER_BOARDS) {
    throw new AppError(`You can add up to ${MAX_USER_BOARDS} career pages.`, 400, "limit");
  }

  let name = companyName || prettifySlug(parsed.slug);
  if (!companyName && parsed.provider === "greenhouse") {
    const info = await fetchJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.slug)}`).catch(() => null);
    if (info?.name) name = info.name;
  }

  let jobs: NormalizedJob[];
  try {
    const fetcher = { greenhouse: fetchGreenhouseBoard, lever: fetchLeverBoard, ashby: fetchAshbyBoard }[parsed.provider];
    jobs = await fetcher({ slug: parsed.slug, name });
  } catch {
    throw new AppError("We couldn't load jobs from that career page. Check the link and try again.", 422, "board_unreachable");
  }

  const board = await db.companyBoard.create({
    data: { provider, slug: parsed.slug, companyName: name, addedByUserId: user.id, jobCount: jobs.length, lastFetchedAt: new Date() },
  });
  const result = await ingestJobs(jobs);
  return NextResponse.json({ board, added: result.inserted, total: jobs.length }, { status: 201 });
});
