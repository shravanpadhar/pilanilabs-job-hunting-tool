import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { computeMatchesForUser } from "@/lib/matching/run";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Re-run two-stage matching for the signed-in user (after resume / preference changes, or on demand). */
export const POST = handler("matches_refresh", async () => {
  const user = await requireUserApi();
  const summary = await computeMatchesForUser(user.id);
  return NextResponse.json(summary);
});
