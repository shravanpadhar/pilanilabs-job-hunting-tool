import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { generateCoverLetter } from "@/lib/ai/cover-letter";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { loadJobAndResume } from "@/lib/jobs/context";
import { assertAiQuota } from "@/lib/rate-limit";
import { resumeSchema } from "@/lib/resume/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Generate a cover letter (<250 words) from the tailored resume if there is one, else the primary resume. Cached on the TailoredResume row. */
export const POST = handler("cover_letter", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id: jobId } = await params;
  const body = (await request.json().catch(() => ({}))) as { regenerate?: boolean };
  const { job, resume, parsed } = await loadJobAndResume(user.id, jobId);

  const key = { userId_jobId_baseResumeId: { userId: user.id, jobId, baseResumeId: resume.id } };
  const existing = await db.tailoredResume.findUnique({ where: key });
  if (existing?.coverLetterText && !body.regenerate) return NextResponse.json({ coverLetter: existing.coverLetterText, cached: true });

  await assertAiQuota(user.id, "cover_letter");
  const basis = existing && existing.changes !== null ? resumeSchema.parse(existing.contentJson) : parsed;
  const coverLetter = await generateCoverLetter({ userId: user.id, resume: basis, job: { title: job.title, company: job.company, description: job.descriptionText } });

  await db.tailoredResume.upsert({
    where: key,
    create: { userId: user.id, jobId, baseResumeId: resume.id, contentJson: parsed as object, changes: Prisma.DbNull, coverLetterText: coverLetter },
    update: { coverLetterText: coverLetter },
  });
  return NextResponse.json({ coverLetter, cached: false });
});
