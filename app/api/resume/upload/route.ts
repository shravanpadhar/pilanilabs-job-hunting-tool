import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseResumeText } from "@/lib/ai/parse-resume";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { AppError, handler } from "@/lib/errors";
import { assertAiQuota } from "@/lib/rate-limit";
import { extractResumeText, validateResumeFile } from "@/lib/resume/extract-text";
import { putFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_RESUMES = 5;

export const POST = handler("resume_upload", async (request: Request) => {
  const user = await requireUserApi();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("Please choose a PDF or DOCX file to upload.", 400, "no_file");

  const count = await db.resume.count({ where: { userId: user.id } });
  if (count >= MAX_RESUMES) throw new AppError(`You can keep up to ${MAX_RESUMES} resumes. Delete one in Settings first.`, 400, "too_many_resumes");

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = validateResumeFile(buffer, file.name); // magic-byte check, not the extension
  if (flags.ai) await assertAiQuota(user.id, "parse_resume");

  const { text, pages } = await extractResumeText(buffer, kind);
  const { data, usedAi } = await parseResumeText(text, user.id);

  const storagePath = `${user.id}/resumes/${randomUUID()}.${kind}`;
  await putFile(storagePath, buffer, file.type || (kind === "pdf" ? "application/pdf" : "application/octet-stream"));

  const resume = await db.resume.create({
    data: {
      userId: user.id,
      fileName: file.name.slice(0, 200),
      fileUrl: storagePath,
      rawText: text,
      parsedJson: data as object,
      isPrimary: count === 0,
    },
    select: { id: true, isPrimary: true },
  });

  return NextResponse.json({ id: resume.id, isPrimary: resume.isPrimary, parsed: data, usedAi, pages });
});
