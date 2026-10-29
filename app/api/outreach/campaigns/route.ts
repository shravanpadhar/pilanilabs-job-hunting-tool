import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { createCampaignFromExtracted, createCampaignFromJob } from "@/lib/outreach/campaigns";
import { extractedJobSchema } from "@/lib/outreach/intake";

export const runtime = "nodejs";
export const maxDuration = 180;

const bodySchema = z.union([z.object({ jobId: z.string().min(1).max(64) }), z.object({ job: extractedJobSchema })]);

/** Create (or reopen) a draft campaign from a feed job or from a job the candidate extracted. */
export const POST = handler("outreach_campaign_create", async (request: Request) => {
  const user = await requireUserApi();
  const body = bodySchema.parse(await request.json());
  const res = "jobId" in body ? await createCampaignFromJob(user.id, body.jobId) : await createCampaignFromExtracted(user.id, body.job);
  return NextResponse.json({ campaignId: res.campaign.id, reused: res.reused });
});

export const GET = handler("outreach_campaign_list", async () => {
  const user = await requireUserApi();
  const rows = await db.outreachCampaign.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, status: true, jobSnapshot: true, createdAt: true } });
  return NextResponse.json(rows);
});
