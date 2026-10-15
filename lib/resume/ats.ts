import { extractSkills, keyTerms, normalizeText } from "@/lib/matching/text";
import { parseMonthIndex } from "@/lib/resume/experience";
import { allSkills, resumeToText, type ResumeData } from "@/lib/resume/schema";

export interface AtsCheck {
  id: string;
  group: "parse" | "format";
  label: string;
  passed: boolean;
  weight: number;
  detail: string;
}

export interface KeywordResult {
  keyword: string;
  kind: "skill" | "term";
  found: boolean;
}

export interface AtsReport {
  overall: number;
  parseScore: number;
  formatScore: number;
  keywordScore: number | null;
  checks: AtsCheck[];
  keywords: { results: KeywordResult[]; matched: string[]; missing: string[]; coverage: number } | null;
  tips: string[];
}

const HEADING_RE = {
  experience: /^(work |professional |relevant )?(experience|employment( history)?|work history)\s*:?$/im,
  education: /^(education|academics|academic background)\s*:?$/im,
  skills: /^(technical |key |core )?skills( (&|and) tools)?\s*:?$/im,
};

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

/**
 * Deterministic ATS check: (1) can a parser read the resume into the right fields,
 * (2) is the layout ATS-friendly, (3) how many job-description keywords does it cover.
 * `rawText` is the text extracted from the uploaded file (or the exported tailored resume).
 */
export function checkAts(input: { rawText: string; resume: ResumeData; jobDescription?: string | null }): AtsReport {
  const { rawText, resume } = input;
  const checks: AtsCheck[] = [];
  const add = (c: AtsCheck) => checks.push(c);

  const words = wordCount(rawText);
  const lines = rawText.split("\n").filter((l) => l.trim());

  // ── Parsing: did we recover the key fields? ─────────────────────────────────
  add({ id: "name", group: "parse", label: "Name detected", weight: 10, passed: Boolean(resume.contact.name), detail: resume.contact.name ? `Found “${resume.contact.name}”.` : "Put your full name on the first line." });
  add({ id: "email", group: "parse", label: "Email detected", weight: 10, passed: Boolean(resume.contact.email), detail: resume.contact.email ? "Email found." : "Add a plain-text email address (not inside an image or icon)." });
  add({ id: "phone", group: "parse", label: "Phone detected", weight: 8, passed: Boolean(resume.contact.phone), detail: resume.contact.phone ? "Phone found." : "Add a phone number with country code." });
  const datedRoles = resume.experience.filter((e) => parseMonthIndex(e.start) !== null);
  const expOk = resume.experience.length > 0 && datedRoles.length === resume.experience.length;
  add({
    id: "experience",
    group: "parse",
    label: "Work experience parsed with dates",
    weight: 15,
    passed: expOk || (resume.experience.length === 0 && (resume.totalYearsExperience ?? 0) < 1 && resume.projects.length > 0),
    detail: resume.experience.length === 0 ? "No work history was detected (fine for freshers with projects)." : expOk ? `${resume.experience.length} role(s) with readable dates.` : "Some roles are missing readable start dates. Use “Mon YYYY – Mon YYYY”.",
  });
  add({ id: "education", group: "parse", label: "Education parsed", weight: 8, passed: resume.education.length > 0, detail: resume.education.length ? `${resume.education.length} entr${resume.education.length > 1 ? "ies" : "y"} found.` : "Add an Education section with degree, institution and year." });
  const skillCount = allSkills(resume).length;
  add({ id: "skills", group: "parse", label: "Skills list found", weight: 10, passed: skillCount >= 5, detail: skillCount >= 5 ? `${skillCount} skills recognised.` : "List at least 5 relevant skills in a dedicated Skills section." });
  const headingsFound = (Object.keys(HEADING_RE) as Array<keyof typeof HEADING_RE>).filter((k) => HEADING_RE[k].test(rawText));
  add({ id: "headings", group: "parse", label: "Standard section headings", weight: 12, passed: headingsFound.length >= 3, detail: headingsFound.length >= 3 ? "Experience, Education and Skills headings found." : `Missing standard headings (found: ${headingsFound.join(", ") || "none"}). Use plain names like “Experience”, “Education”, “Skills”.` });
  const bulletTotal = resume.experience.reduce((n, e) => n + e.bullets.length, 0);
  add({ id: "bullets", group: "parse", label: "Achievements written as bullets", weight: 7, passed: resume.experience.length === 0 || bulletTotal / resume.experience.length >= 2, detail: bulletTotal ? `${bulletTotal} bullet points across roles.` : "Describe each role with 3–5 short bullet points." });

  // ── Format: is the layout ATS-friendly? ──────────────────────────────────────
  add({ id: "length", group: "format", label: "Sensible length", weight: 10, passed: words >= 200 && words <= 1100, detail: `${words} words (~${Math.max(1, Math.ceil(words / 550))} page${words > 550 ? "s" : ""}). Aim for 1 page under 5 years of experience, 2 pages max.` });
  const gapLines = lines.filter((l) => /\S {4,}\S|\t/.test(l)).length;
  const columnish = lines.length > 0 && gapLines / lines.length > 0.15;
  add({ id: "columns", group: "format", label: "Single-column layout", weight: 10, passed: !columnish, detail: columnish ? "Wide gaps suggest columns or tables, which many ATS read out of order. Use a single column." : "No multi-column or table patterns detected." });
  const odd = (rawText.match(/[^\x00-\x7F–—•‘’“”·₹ …]/g) ?? []).length;
  add({ id: "symbols", group: "format", label: "No unusual symbols", weight: 5, passed: odd / Math.max(rawText.length, 1) < 0.01, detail: odd ? `${odd} unusual characters (icons, emoji or decorative glyphs) may not parse.` : "Only standard characters used." });
  const quantified = resume.experience.flatMap((e) => e.bullets).filter((b) => /\d/.test(b)).length;
  add({ id: "metrics", group: "format", label: "Quantified achievements", weight: 8, passed: quantified >= 3 || resume.experience.length === 0, detail: `${quantified} bullet(s) contain numbers. Recruiters look for measurable impact (%, ₹, users, time saved) — only add figures that are true.` });

  const score = (group: AtsCheck["group"]) => {
    const g = checks.filter((c) => c.group === group);
    const total = g.reduce((n, c) => n + c.weight, 0);
    return Math.round((g.filter((c) => c.passed).reduce((n, c) => n + c.weight, 0) / total) * 100);
  };
  const parseScore = score("parse");
  const formatScore = score("format");

  // ── Keywords vs the job description ─────────────────────────────────────────
  let keywords: AtsReport["keywords"] = null;
  let keywordScore: number | null = null;
  const jd = input.jobDescription?.trim();
  if (jd && jd.length > 40) {
    const resumeText = `${rawText}\n${resumeToText(resume)}`;
    const haveSkills = new Set(extractSkills(resumeText));
    const resumeNorm = normalizeText(resumeText);
    const jdSkills = extractSkills(jd).slice(0, 25);
    const terms = keyTerms(jd, 10).filter((t) => !jdSkills.some((s) => t.includes(s)));
    const results: KeywordResult[] = [
      ...jdSkills.map((k) => ({ keyword: k, kind: "skill" as const, found: haveSkills.has(k) })),
      ...terms.map((k) => ({ keyword: k, kind: "term" as const, found: ` ${resumeNorm} `.includes(` ${k} `) })),
    ];
    const weight = (r: KeywordResult) => (r.kind === "skill" ? 2 : 1);
    const total = results.reduce((n, r) => n + weight(r), 0);
    const hit = results.filter((r) => r.found).reduce((n, r) => n + weight(r), 0);
    const coverage = total ? hit / total : 0;
    keywordScore = Math.round(coverage * 100);
    keywords = {
      results,
      matched: results.filter((r) => r.found).map((r) => r.keyword),
      missing: results.filter((r) => !r.found).map((r) => r.keyword),
      coverage,
    };
  }

  const overall = Math.round(keywordScore === null ? parseScore * 0.7 + formatScore * 0.3 : parseScore * 0.4 + formatScore * 0.15 + keywordScore * 0.45);

  const tips = checks.filter((c) => !c.passed).map((c) => c.detail);
  if (keywords?.missing.length) {
    tips.push(`Keywords from the job you don't mention yet: ${keywords.missing.slice(0, 8).join(", ")}. Add only those you genuinely have experience with.`);
  }

  return { overall, parseScore, formatScore, keywordScore, checks, keywords, tips };
}
