import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";
import { log } from "@/lib/logger";
import { exportFileName } from "@/lib/resume/diff";
import { DOCX_MIME } from "@/lib/resume/extract-text";
import { renderResumeDocx } from "@/lib/resume/render-docx";
import { renderResumePdf } from "@/lib/resume/render-pdf";
import { resumeSchema } from "@/lib/resume/schema";
import { putFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Download the (edited) tailored resume as PDF or DOCX. ?format=pdf|docx */
export const GET = handler("tailored_export", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") === "docx" ? "docx" : "pdf";

  const row = await db.tailoredResume.findFirst({ where: { id, userId: user.id }, include: { job: { select: { company: true } } } });
  if (!row) throw notFound("Tailored resume");
  const resume = resumeSchema.parse(row.contentJson);

  const buffer = format === "pdf" ? await renderResumePdf(resume) : await renderResumeDocx(resume);

  // Keep a private copy so the file can be re-downloaded later (best effort).
  try {
    const path = `${user.id}/exports/${row.id}.${format}`;
    await putFile(path, buffer, format === "pdf" ? "application/pdf" : DOCX_MIME);
    await db.tailoredResume.update({ where: { id: row.id }, data: format === "pdf" ? { pdfUrl: path } : { docxUrl: path } });
  } catch (err) {
    log.warn("export_store_failed", { message: (err as Error).message });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : DOCX_MIME,
      "Content-Disposition": `attachment; filename="${exportFileName(resume, row.job.company, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
