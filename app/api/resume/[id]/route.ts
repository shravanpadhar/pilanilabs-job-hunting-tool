import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";
import { computeTotalYears, seniorityFromYears } from "@/lib/resume/experience";
import { resumeSchema } from "@/lib/resume/schema";
import { removeFiles } from "@/lib/storage";

const patchSchema = z.object({
  parsedJson: resumeSchema.optional(),
  isPrimary: z.literal(true).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler("resume_patch", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const body = patchSchema.parse(await request.json());

  const resume = await db.resume.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!resume) throw notFound("Resume");

  let parsedJson = body.parsedJson;
  if (parsedJson) {
    // Keep derived fields consistent with what the user edited.
    const years = computeTotalYears(parsedJson.experience) ?? parsedJson.totalYearsExperience;
    parsedJson = { ...parsedJson, totalYearsExperience: years, seniority: parsedJson.seniority ?? seniorityFromYears(years) };
  }

  await db.$transaction(async (tx) => {
    if (body.isPrimary) {
      await tx.resume.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
    }
    await tx.resume.update({
      where: { id },
      data: { ...(parsedJson ? { parsedJson: parsedJson as object } : {}), ...(body.isPrimary ? { isPrimary: true } : {}) },
    });
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = handler("resume_delete", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const resume = await db.resume.findFirst({ where: { id, userId: user.id } });
  if (!resume) throw notFound("Resume");

  await db.resume.delete({ where: { id } });
  if (resume.fileUrl) await removeFiles([resume.fileUrl]);

  if (resume.isPrimary) {
    const next = await db.resume.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (next) await db.resume.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  return NextResponse.json({ ok: true });
});
