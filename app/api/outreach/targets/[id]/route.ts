import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { acknowledgeRisk, excludeTarget } from "@/lib/outreach/targets";
import { toTargetViews } from "@/lib/outreach/view";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.literal("acknowledge") });

/** "Use this contact anyway": the explicit decision for a low-confidence, risky or unverified contact. */
export const POST = handler("outreach_target_decide", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  bodySchema.parse(await request.json());
  const t = await acknowledgeRisk(user.id, id);
  return NextResponse.json((await toTargetViews([t]))[0]);
});

export const DELETE = handler("outreach_target_exclude", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  await excludeTarget(user.id, id);
  return NextResponse.json({ ok: true });
});
