import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { approveMessage, cancelMessage, editMessage } from "@/lib/outreach/approval";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.union([
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("edit"), subject: z.string().max(300).nullable().optional(), body: z.string().min(1).max(5000) }),
]);

/** Approve a draft or save an edit. An edit always drops any earlier approval. */
export const POST = handler("outreach_message_update", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const body = bodySchema.parse(await request.json());
  const m = body.action === "approve" ? await approveMessage(user.id, id) : await editMessage(user.id, id, { subject: body.subject, body: body.body });
  return NextResponse.json({ id: m.id, state: m.state, approved: m.approvedTextHash !== null && m.state !== "DRAFT", subject: m.subject, body: m.body });
});

export const DELETE = handler("outreach_message_cancel", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  await cancelMessage(user.id, id);
  return NextResponse.json({ ok: true });
});
