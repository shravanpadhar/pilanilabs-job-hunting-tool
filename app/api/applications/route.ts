import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";
import { applicationStatusSchema, idSchema } from "@/lib/validation";

const createSchema = z.object({
  jobId: idSchema,
  status: applicationStatusSchema.default("SAVED"),
  tailoredResumeId: idSchema.nullable().optional(),
  notes: z.string().max(5000).optional(),
});

/** Save a job to the tracker, or move an existing entry (e.g. SAVED → APPLIED after the user confirms). */
export const POST = handler("application_create", async (request: Request) => {
  const user = await requireUserApi();
  const body = createSchema.parse(await request.json());

  const job = await db.job.findUnique({ where: { id: body.jobId }, select: { id: true } });
  if (!job) throw notFound("Job");
  if (body.tailoredResumeId) {
    const tr = await db.tailoredResume.findFirst({ where: { id: body.tailoredResumeId, userId: user.id }, select: { id: true } });
    if (!tr) throw notFound("Tailored resume");
  }

  const existing = await db.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: body.jobId } } });
  const last = await db.application.aggregate({ where: { userId: user.id, status: body.status }, _max: { position: true } });
  const position = (last._max.position ?? 0) + 1;

  if (existing) {
    // Never downgrade (e.g. clicking Save on an Applied job).
    const rank = ["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED"];
    const moveStatus = rank.indexOf(body.status) > rank.indexOf(existing.status) && existing.status !== "REJECTED";
    const updated = await db.application.update({
      where: { id: existing.id },
      data: {
        ...(moveStatus ? { status: body.status, position, ...(body.status === "APPLIED" && !existing.appliedAt ? { appliedAt: new Date() } : {}) } : {}),
        ...(body.tailoredResumeId ? { tailoredResumeId: body.tailoredResumeId } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    return NextResponse.json(updated);
  }

  const created = await db.application.create({
    data: {
      userId: user.id,
      jobId: body.jobId,
      status: body.status,
      position,
      tailoredResumeId: body.tailoredResumeId ?? null,
      notes: body.notes,
      appliedAt: body.status === "APPLIED" ? new Date() : null,
    },
  });
  return NextResponse.json(created, { status: 201 });
});
