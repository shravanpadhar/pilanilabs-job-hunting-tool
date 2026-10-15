import { describe, expect, it, vi } from "vitest";
import { findFabrications, repairFabrications } from "@/lib/resume/verify";
import type { ResumeData } from "@/lib/resume/schema";
import { sampleResume } from "./fixtures";

const clone = (r: ResumeData): ResumeData => structuredClone(r);

/** An honest tailoring: reorders, rephrases, drops a bullet, emphasises existing skills. */
function honestTailoring(): ResumeData {
  const t = clone(sampleResume);
  t.summary = "Senior frontend engineer with 4 years of React and TypeScript experience on fintech dashboards.";
  t.skills.technical = ["React", "TypeScript", "Next.js", "JavaScript", "REST API"];
  t.skills.tools = ["Jest", "Figma", "Git"];
  t.experience[0].bullets = [
    "Led the Next.js migration of the merchant dashboard, cutting page load time by 38%.",
    "Built a reusable TypeScript component library used by 6 product teams.",
  ];
  return t;
}

describe("tailored resume never contains facts absent from the original", () => {
  it("accepts an honest rewrite", () => {
    expect(findFabrications(sampleResume, honestTailoring())).toEqual([]);
  });

  it("companies, titles and degrees in the output are a subset of the input", () => {
    const t = honestTailoring();
    const orig = sampleResume;
    const companies = new Set(orig.experience.map((e) => e.company));
    const titles = new Set(orig.experience.map((e) => e.title));
    const degrees = new Set(orig.education.map((e) => e.degree));
    expect(t.experience.every((e) => companies.has(e.company))).toBe(true);
    expect(t.experience.every((e) => titles.has(e.title))).toBe(true);
    expect(t.education.every((e) => degrees.has(e.degree))).toBe(true);
  });

  it("flags an invented employer, title, degree, certification, skill and metric", () => {
    const t = honestTailoring();
    t.experience.push({ company: "Globex Corporation", title: "CTO", location: null, start: "2019", end: "2020", bullets: [] });
    t.experience[1].title = "Engineering Manager";
    t.education.push({ institution: "Stanford University", degree: "MBA", field: null, start: null, end: null, grade: null });
    t.certifications.push({ name: "Google Cloud Professional Architect", issuer: null, year: null });
    t.skills.technical.push("Rust");
    t.experience[0].bullets.push("Increased revenue by 250% through a redesign.");
    const kinds = findFabrications(sampleResume, t).map((v) => v.kind);
    expect(kinds).toEqual(expect.arrayContaining(["company", "title", "institution", "certification", "skill", "metric"]));
  });

  it("flags changed dates and contact details", () => {
    const t = honestTailoring();
    t.experience[0].start = "Jan 2018";
    t.contact.email = "someone.else@example.com";
    const kinds = findFabrications(sampleResume, t).map((v) => v.kind);
    expect(kinds).toEqual(expect.arrayContaining(["date", "contact"]));
  });

  it("repairFabrications always yields a resume that passes verification", () => {
    const t = honestTailoring();
    t.experience.push({ company: "Globex Corporation", title: "CTO", location: null, start: "2019", end: "2020", bullets: ["Grew team to 500 people."] });
    t.experience[1].title = "Engineering Manager";
    t.skills.technical.push("Rust", "Kubernetes");
    t.certifications.push({ name: "Made-up Certificate", issuer: null, year: null });
    t.experience[0].bullets.push("Saved $2M per year.");
    t.education[0].degree = "PhD";

    const repaired = repairFabrications(sampleResume, t);
    expect(findFabrications(sampleResume, repaired)).toEqual([]);
    // Real employers and titles survive, in the original order.
    expect(repaired.experience.map((e) => e.company)).toEqual(["Cobalt Payments", "Bluefin Retail"]);
    expect(repaired.experience[1].title).toBe("Frontend Developer");
    expect(repaired.contact).toEqual(sampleResume.contact);
  });

  it("restores an employer the model dropped instead of silently losing it", () => {
    const t = honestTailoring();
    t.experience = t.experience.slice(0, 1);
    const repaired = repairFabrications(sampleResume, t);
    expect(repaired.experience.map((e) => e.company)).toContain("Bluefin Retail");
  });
});

describe("tailorResume end-to-end with a misbehaving model", () => {
  it("returns a verified resume even if the model invents facts twice", async () => {
    vi.resetModules();
    const bad = clone(sampleResume);
    bad.experience.push({ company: "Initech", title: "VP Engineering", location: null, start: "2015", end: "2016", bullets: ["Doubled revenue."] });
    bad.skills.technical.push("COBOL");
    vi.doMock("@/lib/ai/client", () => ({ callJson: vi.fn().mockResolvedValue({ resume: bad, changes: [{ section: "experience", change: "x", reason: "y" }], skillGaps: ["GraphQL"] }) }));
    const { tailorResume } = await import("@/lib/ai/tailor-resume");
    const out = await tailorResume({ userId: "u1", resume: sampleResume, job: { title: "Frontend Engineer", company: "Acme", description: "React role" } });
    expect(findFabrications(sampleResume, out.resume)).toEqual([]);
    expect(out.repaired).toBe(true);
    expect(out.resume.experience.map((e) => e.company)).not.toContain("Initech");
    vi.doUnmock("@/lib/ai/client");
  });
});
