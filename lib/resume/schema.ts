import { z } from "zod";

/** Structured resume — shared by parsing, tailoring, editing and the PDF / DOCX renderers. */
const str = z.string();
const optStr = z.string().nullable().default(null);

export const SENIORITY = ["intern", "entry", "junior", "mid", "senior", "lead", "principal", "manager", "director", "executive"] as const;

export const resumeSchema = z.object({
  contact: z.object({
    name: optStr,
    email: optStr,
    phone: optStr,
    location: optStr,
    links: z.array(z.object({ label: str, url: str })).default([]),
  }),
  summary: optStr,
  skills: z.object({
    technical: z.array(str).default([]),
    tools: z.array(str).default([]),
    soft: z.array(str).default([]),
  }),
  experience: z
    .array(
      z.object({
        company: str,
        title: str,
        location: optStr,
        start: optStr,
        end: optStr,
        bullets: z.array(str).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        institution: str,
        degree: optStr,
        field: optStr,
        start: optStr,
        end: optStr,
        grade: optStr,
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: str,
        description: optStr,
        tech: z.array(str).default([]),
        bullets: z.array(str).default([]),
        url: optStr,
      }),
    )
    .default([]),
  certifications: z.array(z.object({ name: str, issuer: optStr, year: optStr })).default([]),
  totalYearsExperience: z.number().nullable().default(null),
  seniority: z.enum(SENIORITY).nullable().default(null),
  inferredTargetRoles: z.array(str).default([]),
});

export type ResumeData = z.output<typeof resumeSchema>;

export const tailoredOutputSchema = z.object({
  resume: resumeSchema,
  changes: z
    .array(z.object({ section: str, change: str, reason: str.default("") }))
    .default([]),
  skillGaps: z.array(str).default([]),
});

export type TailoredOutput = z.output<typeof tailoredOutputSchema>;

export function emptyResume(): ResumeData {
  return resumeSchema.parse({ contact: {}, skills: {} });
}

/** Every skill string in the resume, de-duplicated. */
export function allSkills(r: ResumeData): string[] {
  return Array.from(new Set([...r.skills.technical, ...r.skills.tools, ...r.skills.soft].map((s) => s.trim()).filter(Boolean)));
}

/** Flatten a resume to plain text (used for keyword matching and ATS checks). */
export function resumeToText(r: ResumeData): string {
  const lines: string[] = [];
  const c = r.contact;
  lines.push([c.name, c.email, c.phone, c.location, ...c.links.map((l) => l.url)].filter(Boolean).join(" | "));
  if (r.summary) lines.push("SUMMARY", r.summary);
  const skills = allSkills(r);
  if (skills.length) lines.push("SKILLS", skills.join(", "));
  if (r.experience.length) {
    lines.push("EXPERIENCE");
    for (const e of r.experience) {
      lines.push(`${e.title} — ${e.company}${e.location ? `, ${e.location}` : ""} (${e.start ?? ""} – ${e.end ?? ""})`);
      for (const b of e.bullets) lines.push(`• ${b}`);
    }
  }
  if (r.projects.length) {
    lines.push("PROJECTS");
    for (const p of r.projects) {
      lines.push(`${p.name}${p.tech.length ? ` (${p.tech.join(", ")})` : ""}${p.description ? ` — ${p.description}` : ""}`);
      for (const b of p.bullets) lines.push(`• ${b}`);
    }
  }
  if (r.education.length) {
    lines.push("EDUCATION");
    for (const e of r.education) lines.push([e.degree, e.field, e.institution, e.end ?? e.start, e.grade].filter(Boolean).join(", "));
  }
  if (r.certifications.length) {
    lines.push("CERTIFICATIONS");
    for (const c2 of r.certifications) lines.push([c2.name, c2.issuer, c2.year].filter(Boolean).join(", "));
  }
  return lines.join("\n");
}
