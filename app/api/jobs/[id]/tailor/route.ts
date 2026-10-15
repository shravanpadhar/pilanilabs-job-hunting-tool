import { NextResponse } from "next/server";
import { z } from "zod";
import { tailorResume } from "@/lib/ai/tailor-resume";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, handler } from "@/lib/errors";
import { loadJobAndResume } from "@/lib/jobs/context";
import { assertAiQuota } from "@/lib/rate-limit";
import { resumeSchema } from "@/lib/resume/schema";

export const runtime = "nodejs";
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

const postSchema = z.object({ regenerate: z.boolean().optional() });

/** Generate (or return the cached) tailored resume for this job. */
export const POST = handler("tailor_resume", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id: jobId } = await params;
  const { regenerate } = postSchema.parse(await request.json().catch(() => ({})));
  const { job, resume, parsed } = await loadJobAndResume(user.id, jobId);

  const key = { userId_jobId_baseResumeId: { userId: user.id, jobId, baseResumeId: resume.id } };
  const existing = await db.tailoredResume.findUnique({ where: key });
  const shortDescription = job.descriptionText.length < 400;

  if (existing && existing.changes !== null && !regenerate) {
    return NextResponse.json({
      id: existing.id,
      original: parsed,
      tailored: resumeSchema.parse(existing.contentJson),
      changes: existing.changes,
      skillGaps: existing.skillGaps ?? [],
      cached: true,
      shortDescription,
    });
  }

  await assertAiQuota(user.id, "tailor_resume");
  const out = await tailorResume({ userId: user.id, resume: parsed, job: { title: job.title, company: job.company, description: job.descriptionText } });

  const data = { contentJson: out.resume as object, changes: out.changes as object[], skillGaps: out.skillGaps as string[], pdfUrl: null, docxUrl: null };
  const saved = await db.tailoredResume.upsert({
    where: key,
    create: { userId: user.id, jobId, baseResumeId: resume.id, ...data },
    update: data,
  });

  return NextResponse.json({ id: saved.id, original: parsed, tailored: out.resume, changes: out.changes, skillGaps: out.skillGaps, cached: false, repaired: out.repaired, shortDescription });
});

const putSchema = z.object({ contentJson: resumeSchema });

/** Save the user's manual edits to the tailored resume. */
export const PUT = handler("tailor_save", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id: jobId } = await params;
  const { contentJson } = putSchema.parse(await request.json());
  const resume = await db.resume.findFirst({ where: { userId: user.id, isPrimary: true }, select: { id: true } });
  const existing = resume
    ? await db.tailoredResume.findUnique({ where: { userId_jobId_baseResumeId: { userId: user.id, jobId, baseResumeId: resume.id } }, select: { id: true } })
    : null;
  if (!existing) throw notFound("Tailored resume");
  await db.tailoredResume.update({ where: { id: existing.id }, data: { contentJson: contentJson as object, pdfUrl: null, docxUrl: null } });
  return NextResponse.json({ ok: true });
});
