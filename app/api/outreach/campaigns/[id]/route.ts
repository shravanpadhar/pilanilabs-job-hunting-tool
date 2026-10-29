import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { loadCampaign } from "@/lib/outreach/campaigns";
import { toTargetViews } from "@/lib/outreach/view";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler("outreach_campaign_get", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const c = await loadCampaign(user.id, id);
  return NextResponse.json({ id: c.id, status: c.status, mode: c.mode, jobSnapshot: c.jobSnapshot, targets: await toTargetViews(c.targets) });
});
