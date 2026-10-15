import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { parseFilters } from "@/lib/jobs/filters";
import { attachSaved, queryJobs, queryMatchedFeed } from "@/lib/jobs/query";

/** Paged feed for infinite scroll. ?feed=matched (default) | hidden, plus filter params and ?page=. */
export const GET = handler("jobs_feed", async (request: Request) => {
  const user = await requireUserApi();
  const sp = new URL(request.url).searchParams;
  const filters = parseFilters(sp);
  const page = Math.max(1, Math.min(200, Number(sp.get("page")) || 1));
  const feed = sp.get("feed") === "hidden" ? "hidden" : "matched";

  const result = feed === "hidden" ? await queryJobs(user.id, filters, { hiddenOnly: true, page }) : await queryMatchedFeed(user.id, filters, page);
  return NextResponse.json(await attachSaved(user.id, result));
});
