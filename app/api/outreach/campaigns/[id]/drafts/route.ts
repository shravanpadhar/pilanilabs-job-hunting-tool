import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { generateDraftsForCampaign } from "@/lib/outreach/draft";
import { loadDraftsView } from "@/lib/outreach/drafts-view";

export const runtime = "nodejs";
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler("outreach_drafts_get", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  return NextResponse.json(await loadDraftsView(user.id, id));
});

/** Write drafts for every contact the candidate may use. Already-approved messages are left untouched. */
export const POST = handler("outreach_drafts_generate", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const res = await generateDraftsForCampaign(user.id, id);
  return NextResponse.json({ ...res, view: await loadDraftsView(user.id, id) });
});
