import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { resumeSchema, type ResumeData } from "@/lib/resume/schema";

/** Load a job plus the user's primary resume (parsed). Throws friendly errors if either is missing. */
export async function loadJobAndResume(userId: string, jobId: string) {
  const [job, resume] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.resume.findFirst({ where: { userId, isPrimary: true } }),
  ]);
  if (!job) throw notFound("Job");
  if (!resume) throw new AppError("Upload your resume first — we need it to do this.", 400, "no_resume");
  const parsed: ResumeData = resumeSchema.parse(resume.parsedJson);
  return { job, resume, parsed };
}

/** Text of a job suitable for AI prompts and keyword checks. */
export function jobText(job: { title: string; company: string; descriptionText: string }): string {
  return `${job.title}\n${job.company}\n${job.descriptionText}`;
}
