import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { discoverTargets } from "@/lib/outreach/targets";
import { toTargetViews } from "@/lib/outreach/view";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ limit: z.number().int().min(1).max(5).optional() });

/** Find and verify people to contact (licensed providers only). Safe to call again to get further candidates. */
export const POST = handler("outreach_targets_discover", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const { limit } = bodySchema.parse(await request.json().catch(() => ({})));
  const res = await discoverTargets({ userId: user.id, campaignId: id, limit });
  return NextResponse.json({ targets: await toTargetViews(res.targets), droppedSuppressed: res.droppedSuppressed, droppedRegion: res.droppedRegion });
});
