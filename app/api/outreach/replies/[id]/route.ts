import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.literal("confirm_interview") });

/** Journey 3: the candidate confirms an interview, and the job moves to Interviewing in the tracker. Never automatic. */
export const POST = handler("outreach_reply_action", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  bodySchema.parse(await request.json());
  const reply = await db.reply.findFirst({ where: { id, message: { target: { campaign: { userId: user.id } } } }, include: { message: { include: { target: { include: { campaign: true } } } } } });
  if (!reply) throw notFound("Reply");
  const jobId = reply.message.target.campaign.jobId;
  if (!jobId) return NextResponse.json({ ok: false, error: "This outreach is not linked to a job in your tracker." }, { status: 409 });
  await db.application.upsert({
    where: { userId_jobId: { userId: user.id, jobId } },
    create: { userId: user.id, jobId, tailoredResumeId: reply.message.target.campaign.tailoredResumeId, status: "INTERVIEWING", appliedAt: new Date() },
    update: { status: "INTERVIEWING" },
  });
  await audit({ userId: user.id, action: "application.interviewing", entityType: "Reply", entityId: id });
  return NextResponse.json({ ok: true });
});
