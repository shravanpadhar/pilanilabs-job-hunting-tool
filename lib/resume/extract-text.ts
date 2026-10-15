import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { limits } from "@/config/site";
import { AppError } from "@/lib/errors";

export type ResumeFileKind = "pdf" | "docx";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const FILE_MIME: Record<ResumeFileKind, string> = { pdf: "application/pdf", docx: DOCX_MIME };

/** Identify the real file type from magic bytes — never trust the extension or the browser's MIME type. */
export function detectFileKind(buf: Buffer): ResumeFileKind | null {
  if (buf.length > 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (isZip && buf.includes(Buffer.from("word/document.xml"))) return "docx";
  return null;
}

/** Validate size + type, returning the detected kind. Throws a friendly AppError otherwise. */
export function validateResumeFile(buf: Buffer, fileName: string): ResumeFileKind {
  if (buf.length === 0) throw new AppError("That file is empty.", 400, "empty_file");
  if (buf.length > limits.maxResumeBytes) throw new AppError("That file is larger than 5 MB. Please upload a smaller PDF or DOCX.", 413, "file_too_large");
  const kind = detectFileKind(buf);
  if (!kind) throw new AppError("We could only read PDF or DOCX files. Please export your resume in one of those formats.", 415, "unsupported_type");
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext && ["pdf", "docx"].includes(ext) && ext !== kind) {
    throw new AppError("The file extension doesn't match its contents. Please re-export your resume.", 415, "type_mismatch");
  }
  return kind;
}

export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ /g, " ")
    .trim();
}

export interface ExtractedResume {
  text: string;
  pages: number | null;
}

export async function extractResumeText(buf: Buffer, kind: ResumeFileKind): Promise<ExtractedResume> {
  let text = "";
  let pages: number | null = null;
  try {
    if (kind === "pdf") {
      // unpdf bundles a serverless build of pdf.js: no DOM polyfills or native add-ons, so it runs on Vercel.
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text;
      pages = result.totalPages ?? null;
    } else {
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    }
  } catch {
    throw new AppError("We couldn't open that file. It may be corrupted or password-protected.", 422, "unreadable");
  }
  text = cleanExtractedText(text);
  if (text.length < 80) {
    throw new AppError(
      "We couldn't find readable text in that file. If it's a scanned image, please export a text-based PDF or DOCX.",
      422,
      "no_text",
    );
  }
  return { text, pages };
}
