import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import { checkAts } from "@/lib/resume/ats";
import { exportFileName } from "@/lib/resume/diff";
import { detectFileKind, extractResumeText } from "@/lib/resume/extract-text";
import { renderResumeDocx } from "@/lib/resume/render-docx";
import { renderResumePdf } from "@/lib/resume/render-pdf";
import { sampleResume } from "./fixtures";

describe("exports are valid and ATS-readable", () => {
  it("PDF: valid file whose text can be extracted in reading order", async () => {
    const pdf = await renderResumePdf(sampleResume);
    expect(detectFileKind(pdf)).toBe("pdf");
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    const text = (await parser.getText()).text;
    await parser.destroy();
    for (const needle of ["Asha Verma", "asha.verma@example.com", "EXPERIENCE", "Cobalt Payments", "Senior Frontend Engineer", "EDUCATION", "Pune Institute of Technology", "Next.js"]) {
      expect(text).toContain(needle);
    }
    // Regression: name and contact line must extract as separate lines (they once fused into "Asha Vermaasha.verma@…").
    expect(text).toMatch(/Asha Verma\r?\nasha\.verma@example\.com/);
    expect(text.indexOf("SUMMARY")).toBeLessThan(text.indexOf("EXPERIENCE"));
    expect(text.indexOf("EXPERIENCE")).toBeLessThan(text.indexOf("EDUCATION"));
  }, 30_000);

  it("DOCX: valid file whose text can be extracted", async () => {
    const docx = await renderResumeDocx(sampleResume);
    expect(detectFileKind(docx)).toBe("docx");
    const { value } = await mammoth.extractRawText({ buffer: docx });
    for (const needle of ["Asha Verma", "SUMMARY", "EXPERIENCE", "Cobalt Payments", "Jest unit tests", "B.E."]) expect(value).toContain(needle);
  }, 30_000);

  it("an exported PDF re-ingests through our own pipeline and scores as ATS-friendly", async () => {
    const pdf = await renderResumePdf(sampleResume);
    const { text } = await extractResumeText(pdf, "pdf");
    const report = checkAts({ rawText: text, resume: sampleResume });
    expect(report.checks.find((c) => c.id === "headings")!.passed).toBe(true);
    expect(report.checks.find((c) => c.id === "columns")!.passed).toBe(true);
  }, 30_000);

  it("builds safe download file names", () => {
    expect(exportFileName(sampleResume, "Cobalt Payments / Pvt.", "pdf")).toBe("Asha_Verma_Cobalt_Payments_Pvt_Resume.pdf");
  });
});
