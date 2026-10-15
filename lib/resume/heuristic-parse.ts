import { SOFT_SKILLS } from "@/config/skills";
import { extractSkills } from "@/lib/matching/text";
import { computeTotalYears, seniorityFromYears } from "@/lib/resume/experience";
import { resumeSchema, type ResumeData } from "@/lib/resume/schema";

/**
 * Offline fallback parser used when no AI key is configured, or when the AI parse fails.
 * It is deliberately simple — Claude does the real parsing in production — but it produces
 * the same ResumeData shape so the rest of the app works end to end.
 */
const SECTION_HEADINGS: Record<string, RegExp> = {
  summary: /^(professional |career )?(summary|profile|objective|about me)$/i,
  experience: /^(work |professional |relevant |employment )?(experience|history|employment history|work history)$/i,
  education: /^(education|academics|academic background|education & training)$/i,
  skills: /^(technical |key |core )?skills( (&|and) tools)?$/i,
  projects: /^(academic |personal |key )?projects$/i,
  certifications: /^(certifications?|licenses?( (&|and) certifications?)?|courses|training)$/i,
};

const TOOLS = new Set([
  "jira", "confluence", "figma", "sketch", "adobe xd", "photoshop", "illustrator", "postman", "jenkins", "github actions", "tableau", "power bi",
  "looker", "excel", "hubspot", "salesforce", "marketo", "sap", "tally", "docker", "kubernetes", "terraform", "ansible", "selenium", "cypress",
  "playwright", "mixpanel", "amplitude", "google analytics", "datadog", "grafana", "prometheus", "airflow", "dbt", "after effects", "storybook",
]);

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(present|current|now|till date|${DATE})`, "i");
const BULLET_RE = /^\s*[•●▪■◦·*\-–—>]\s*/;
const TITLE_WORDS = /(engineer|developer|manager|analyst|designer|lead|intern|consultant|specialist|executive|associate|architect|director|head|officer|scientist|administrator|coordinator|trainee|programmer)/i;
const DEGREE_RE = /(b\.?\s?tech|b\.?\s?e\b|bachelor|master|m\.?\s?tech|m\.?\s?e\b|mba|b\.?\s?sc|m\.?\s?sc|bca|mca|b\.?\s?com|m\.?\s?com|ph\.?d|diploma|b\.?\s?a\b|m\.?\s?a\b|pgdm|12th|10th)/i;
const INSTITUTION_RE = /(university|institute|college|school|iit|nit|iiit|bits|academy)/i;

function splitSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const line of lines) {
    const bare = line.replace(/[:\s]+$/, "").trim();
    const hit = Object.entries(SECTION_HEADINGS).find(([, re]) => bare.length < 40 && re.test(bare));
    if (hit) {
      current = hit[0];
      sections[current] ??= [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }
  return sections;
}

function normalizeDate(raw: string): string {
  const v = raw.trim();
  if (/^(present|current|now|till date)$/i.test(v)) return "Present";
  return v.replace(/\s+/g, " ");
}

export function heuristicParse(text: string): ResumeData {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitSections(lines);
  const header = (sections.header ?? []).filter(Boolean);

  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  const phone = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/)?.[0]?.trim() ?? null;
  const links = Array.from(text.matchAll(/https?:\/\/[^\s)]+|(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s)]+/gi)).map((m) => ({
    label: /linkedin/i.test(m[0]) ? "LinkedIn" : /github/i.test(m[0]) ? "GitHub" : "Link",
    url: m[0].startsWith("http") ? m[0] : `https://${m[0]}`,
  }));
  const name = header.find((l) => l.split(/\s+/).length <= 5 && !/[\d@:/]/.test(l) && /^[A-Za-z .'-]+$/.test(l)) ?? null;
  const location = header.find((l) => /,\s*(india|[A-Z]{2})\b/i.test(l) && !/@/.test(l))?.replace(/[|•].*$/, "").trim() ?? null;

  // Experience
  const exp = sections.experience ?? [];
  const experience: ResumeData["experience"] = [];
  for (let i = 0; i < exp.length; i++) {
    const m = exp[i].match(RANGE_RE);
    if (!m) continue;
    let headerText = exp[i].replace(RANGE_RE, "").replace(/[()|,]+\s*$/g, "").replace(/^[\s|,-]+|[\s|,-]+$/g, "");
    if (!headerText && i > 0) headerText = exp[i - 1];
    const parts = headerText.split(/\s+(?:at|@)\s+|\s+[|–—-]\s+|\s*\|\s*|,\s+/).map((p) => p.trim()).filter(Boolean);
    let title = parts[0] ?? "Role";
    let company = parts[1] ?? "Company";
    if (!TITLE_WORDS.test(title) && TITLE_WORDS.test(company)) [title, company] = [company, title];
    const bullets: string[] = [];
    for (let j = i + 1; j < exp.length && !RANGE_RE.test(exp[j]); j++) {
      const clean = exp[j].replace(BULLET_RE, "").trim();
      if (!clean) continue;
      if (BULLET_RE.test(exp[j]) || clean.length > 30) bullets.push(clean);
    }
    experience.push({ company, title, location: null, start: normalizeDate(m[1]), end: normalizeDate(m[2]), bullets: bullets.slice(0, 8) });
  }

  // Education
  const education: ResumeData["education"] = [];
  const edu = (sections.education ?? []).filter(Boolean);
  for (let i = 0; i < edu.length; i++) {
    if (!DEGREE_RE.test(edu[i])) continue;
    const near = [edu[i - 1], edu[i], edu[i + 1]].filter(Boolean) as string[];
    const institution = near.find((l) => INSTITUTION_RE.test(l)) ?? edu[i];
    const range = near.join(" ").match(RANGE_RE);
    education.push({
      institution: institution.replace(RANGE_RE, "").trim(),
      degree: edu[i].replace(RANGE_RE, "").trim(),
      field: null,
      start: range ? normalizeDate(range[1]) : null,
      end: range ? normalizeDate(range[2]) : (edu.join(" ").match(/\b(19|20)\d{2}\b/)?.[0] ?? null),
      grade: edu.join(" ").match(/(?:cgpa|gpa|percentage)[:\s]*([\d.]+%?)/i)?.[1] ?? null,
    });
  }

  const certifications = (sections.certifications ?? [])
    .filter(Boolean)
    .slice(0, 8)
    .map((l) => ({ name: l.replace(BULLET_RE, "").trim(), issuer: null, year: l.match(/\b(19|20)\d{2}\b/)?.[0] ?? null }));

  const projLines = (sections.projects ?? []).filter(Boolean);
  const projects: ResumeData["projects"] = [];
  for (const l of projLines) {
    if (BULLET_RE.test(l) && projects.length) projects[projects.length - 1].bullets.push(l.replace(BULLET_RE, "").trim());
    else if (l.length < 90) projects.push({ name: l, description: null, tech: [], bullets: [], url: null });
  }

  const skillsFound = extractSkills(text);
  const soft = skillsFound.filter((s) => SOFT_SKILLS.has(s));
  const tools = skillsFound.filter((s) => TOOLS.has(s));
  const technical = skillsFound.filter((s) => !SOFT_SKILLS.has(s) && !TOOLS.has(s));

  const totalYears = computeTotalYears(experience);
  const roles = Array.from(new Set(experience.slice(0, 2).map((e) => e.title))).filter((t) => TITLE_WORDS.test(t));

  return resumeSchema.parse({
    contact: { name, email, phone: phone && phone.replace(/\D/g, "").length >= 10 ? phone : null, location, links },
    summary: (sections.summary ?? []).filter(Boolean).join(" ").slice(0, 600) || null,
    skills: { technical, tools, soft },
    experience,
    education,
    projects: projects.slice(0, 6),
    certifications,
    totalYearsExperience: totalYears,
    seniority: seniorityFromYears(totalYears),
    inferredTargetRoles: roles,
  });
}
