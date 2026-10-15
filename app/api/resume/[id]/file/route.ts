import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";
import { readLocalFile, signedUrl } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** Owner-only download of the original upload. Supabase: redirect to a 5-minute signed URL. */
export const GET = handler("resume_file", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const resume = await db.resume.findFirst({ where: { id, userId: user.id }, select: { fileUrl: true, fileName: true } });
  if (!resume?.fileUrl) throw notFound("File");

  const url = await signedUrl(resume.fileUrl, 300);
  if (url) return NextResponse.redirect(url);

  const buf = await readLocalFile(resume.fileUrl);
  if (!buf) throw notFound("File");
  const isPdf = resume.fileUrl.endsWith(".pdf");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(resume.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
