import { NextResponse } from "next/server";
import { z } from "zod";
import { draftReferral, RELATIONSHIPS } from "@/lib/ai/referral";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { loadJobAndResume } from "@/lib/jobs/context";
import { assertAiQuota } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({
  contactName: z.string().trim().max(80).optional(),
  contactRole: z.string().trim().max(120).optional(),
  relationship: z.enum(RELATIONSHIPS).default("cold"),
  tone: z.enum(["professional", "friendly"]).default("professional"),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * Drafts a LinkedIn connection note + follow-up message. Nothing is sent, scraped or automated —
 * the user opens LinkedIn themselves, finds a person, and pastes the draft.
 */
export const POST = handler("referral_draft", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id: jobId } = await params;
  const body = bodySchema.parse(await request.json());
  const { job, parsed } = await loadJobAndResume(user.id, jobId);

  await assertAiQuota(user.id, "referral");
  const draft = await draftReferral({
    userId: user.id,
    resume: parsed,
    job: { title: job.title, company: job.company, applyUrl: job.applyUrl },
    contactName: body.contactName || null,
    contactRole: body.contactRole || null,
    relationship: body.relationship,
    tone: body.tone,
  });

  const saved = await db.referralDraft.create({
    data: {
      userId: user.id,
      jobId,
      contactName: body.contactName || null,
      contactRole: body.contactRole || null,
      relationship: body.relationship,
      connectionNote: draft.connectionNote,
      followUpMessage: draft.followUpMessage,
    },
  });
  return NextResponse.json({ id: saved.id, ...draft });
});
