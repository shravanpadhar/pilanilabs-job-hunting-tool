import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { activateCampaign, setCampaignStatus } from "@/lib/outreach/activate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.enum(["start", "pause", "resume", "cancel"]) });

/** Start sending (schedules every approved email), or pause / resume / cancel a campaign. */
export const POST = handler("outreach_campaign_status", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const { action } = bodySchema.parse(await request.json());
  if (action === "start") return NextResponse.json({ ok: true, ...(await activateCampaign(user.id, id)) });
  await setCampaignStatus(user.id, id, action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "CANCELLED");
  return NextResponse.json({ ok: true });
});
