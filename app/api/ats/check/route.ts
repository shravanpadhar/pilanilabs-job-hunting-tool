import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, handler } from "@/lib/errors";
import { checkAts } from "@/lib/resume/ats";
import { resumeSchema } from "@/lib/resume/schema";

const bodySchema = z.object({
  resumeId: z.string().min(1).optional(),
  jobDescription: z.string().trim().max(30_000).optional(),
});

/** Standalone ATS checker: any saved resume vs pasted job-description text (or a general parse check). */
export const POST = handler("ats_check", async (request: Request) => {
  const user = await requireUserApi();
  const { resumeId, jobDescription } = bodySchema.parse(await request.json());
  const resume = await db.resume.findFirst({ where: resumeId ? { id: resumeId, userId: user.id } : { userId: user.id, isPrimary: true } });
  if (!resume) throw new AppError("Upload a resume first.", 400, "no_resume");
  const report = checkAts({ rawText: resume.rawText, resume: resumeSchema.parse(resume.parsedJson), jobDescription });
  return NextResponse.json({ report, resumeName: resume.fileName });
});
