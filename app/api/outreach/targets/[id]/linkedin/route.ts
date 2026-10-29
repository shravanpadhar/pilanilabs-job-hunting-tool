import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { applyLinkedInEvent } from "@/lib/outreach/linkedin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.enum(["request_sent", "accepted", "message_sent", "withdraw"]) });

/**
 * The candidate tells us what they did in LinkedIn. We never contact LinkedIn: this only records their word and moves the
 * state machine (illegal moves, such as messaging before acceptance, are rejected).
 */
export const POST = handler("outreach_linkedin_event", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const { action } = bodySchema.parse(await request.json());
  const step = await applyLinkedInEvent(user.id, id, action);
  return NextResponse.json({ state: step.state, expiresAt: step.expiresAt?.toISOString() ?? null });
});
