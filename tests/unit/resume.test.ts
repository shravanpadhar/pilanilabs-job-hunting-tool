import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/ai/client";
import { checkAts } from "@/lib/resume/ats";
import { computeTotalYears, parseMonthIndex, seniorityFromYears } from "@/lib/resume/experience";
import { cleanExtractedText, detectFileKind, validateResumeFile } from "@/lib/resume/extract-text";
import { heuristicParse } from "@/lib/resume/heuristic-parse";
import { resumeSchema } from "@/lib/resume/schema";
import { sampleJobDescription, sampleResume, sampleResumeText } from "./fixtures";

describe("resume file validation (magic bytes)", () => {
  const pdf = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n");
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....word/document.xml....")]);
  const exe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00");

  it("detects PDF and DOCX by content", () => {
    expect(detectFileKind(pdf)).toBe("pdf");
    expect(detectFileKind(docx)).toBe("docx");
    expect(detectFileKind(exe)).toBeNull();
    expect(detectFileKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull(); // zip without word/document.xml
  });
  it("rejects a renamed executable even with a .pdf extension", () => {
    expect(() => validateResumeFile(exe, "resume.pdf")).toThrow(/PDF or DOCX/);
  });
  it("rejects extension/content mismatch, empty and oversized files", () => {
    expect(() => validateResumeFile(pdf, "resume.docx")).toThrow(/extension/);
    expect(() => validateResumeFile(Buffer.alloc(0), "a.pdf")).toThrow(/empty/);
    expect(() => validateResumeFile(Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]), "a.pdf")).toThrow(/5 MB/);
    expect(validateResumeFile(pdf, "My Resume.PDF")).toBe("pdf");
  });
  it("cleans page markers from extracted text", () => {
    expect(cleanExtractedText("Hello\r\n-- 1 of 2 --\n\n\n\nWorld")).toBe("Hello\n\nWorld");
  });
});

describe("experience maths", () => {
  it("parses common date formats", () => {
    expect(parseMonthIndex("Jan 2022")).toBe(2022 * 12);
    expect(parseMonthIndex("03/2021")).toBe(2021 * 12 + 2);
    expect(parseMonthIndex("2019")).toBe(2019 * 12 + 5);
    expect(parseMonthIndex("garbage")).toBeNull();
  });
  it("merges overlapping roles when totalling experience", () => {
    const now = new Date("2026-01-01");
    const years = computeTotalYears(
      [
        { company: "A", title: "x", location: null, start: "Jan 2020", end: "Dec 2021", bullets: [] },
        { company: "B", title: "y", location: null, start: "Jun 2021", end: "Dec 2022", bullets: [] }, // overlaps A by 6 months
      ],
      now,
    );
    expect(years).toBeCloseTo(3, 0); // Jan 2020 → Dec 2022 ≈ 3 years, not 3.5
  });
  it("derives seniority", () => {
    expect(seniorityFromYears(0.5)).toBe("entry");
    expect(seniorityFromYears(4)).toBe("mid");
    expect(seniorityFromYears(12)).toBe("lead");
    expect(seniorityFromYears(null)).toBeNull();
  });
});

describe("heuristic parser (offline fallback)", () => {
  const parsed = heuristicParse(sampleResumeText);
  it("extracts contact details without guessing", () => {
    expect(parsed.contact.name).toBe("Asha Verma");
    expect(parsed.contact.email).toBe("asha.verma@example.com");
    expect(parsed.contact.phone).toContain("98765");
    expect(heuristicParse("Some text with no contact details at all, just words.\nAnd another line.").contact.email).toBeNull();
  });
  it("finds roles, education and skills", () => {
    expect(parsed.experience.map((e) => e.company)).toEqual(expect.arrayContaining(["Cobalt Payments", "Bluefin Retail"]));
    expect(parsed.experience[0].end).toBe("Present");
    expect(parsed.education[0]?.institution).toMatch(/Pune Institute/);
    expect(parsed.skills.technical).toEqual(expect.arrayContaining(["react", "typescript"]));
    expect(parsed.totalYearsExperience).toBeGreaterThan(4);
  });
  it("always produces schema-valid output", () => {
    expect(() => resumeSchema.parse(parsed)).not.toThrow();
  });
});

describe("ATS checker", () => {
  it("scores a clean resume well and reports keyword coverage", () => {
    const r = checkAts({ rawText: sampleResumeText, resume: sampleResume, jobDescription: sampleJobDescription });
    expect(r.parseScore).toBeGreaterThanOrEqual(85);
    expect(r.keywords).not.toBeNull();
    expect(r.keywords!.matched).toEqual(expect.arrayContaining(["react", "typescript", "next.js", "jest", "figma"]));
    expect(r.keywords!.missing).toEqual(expect.arrayContaining(["graphql", "tailwind css"]));
    expect(r.keywordScore).toBeGreaterThan(50);
    expect(r.overall).toBeGreaterThan(60);
  });
  it("penalises unreadable resumes and gives actionable tips", () => {
    const empty = resumeSchema.parse({ contact: {}, skills: {} });
    const r = checkAts({ rawText: "x    y    z\t\tcolumns ".repeat(30), resume: empty });
    expect(r.parseScore).toBeLessThan(40);
    expect(r.keywords).toBeNull();
    expect(r.tips.length).toBeGreaterThan(3);
    expect(r.checks.find((c) => c.id === "columns")!.passed).toBe(false);
  });
});

describe("AI JSON extraction", () => {
  it("handles fences, prose and arrays", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go: {"a":{"b":[1,2]}} Hope that helps')).toEqual({ a: { b: [1, 2] } });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
    expect(() => extractJson("no json here")).toThrow();
  });
});
