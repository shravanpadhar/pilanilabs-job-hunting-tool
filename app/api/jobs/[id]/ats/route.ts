import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { loadJobAndResume } from "@/lib/jobs/context";
import { checkAts } from "@/lib/resume/ats";
import { resumeSchema, resumeToText } from "@/lib/resume/schema";

const bodySchema = z.object({ source: z.enum(["primary", "tailored"]).default("primary") });

type Ctx = { params: Promise<{ id: string }> };

/** ATS score for the user's resume (original upload or the tailored version) against this job. No AI, no quota. */
export const POST = handler("job_ats", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id: jobId } = await params;
  const { source } = bodySchema.parse(await request.json().catch(() => ({})));
  const { job, resume, parsed } = await loadJobAndResume(user.id, jobId);

  const tailoredRow =
    source === "tailored"
      ? await db.tailoredResume.findUnique({ where: { userId_jobId_baseResumeId: { userId: user.id, jobId, baseResumeId: resume.id } } })
      : null;
  const tailored = tailoredRow && tailoredRow.changes !== null ? resumeSchema.parse(tailoredRow.contentJson) : null;
  const useTailored = source === "tailored" && tailored;

  const report = checkAts({
    rawText: useTailored ? resumeToText(tailored) : resume.rawText,
    resume: useTailored ? tailored : parsed,
    jobDescription: `${job.title}\n${job.descriptionText}`,
  });
  return NextResponse.json({ report, source: useTailored ? "tailored" : "primary" });
});
