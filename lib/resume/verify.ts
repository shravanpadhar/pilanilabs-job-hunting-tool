import type { ResumeData } from "@/lib/resume/schema";

/**
 * Anti-fabrication guard. A tailored resume may reorder, rephrase and select — it may never
 * introduce employers, titles, dates, institutions, degrees, certifications, skills or numbers
 * that are not in the original. `findFabrications` reports violations; `repairFabrications`
 * removes them so the guarantee holds even if the model misbehaves.
 */
export interface Violation {
  kind: "company" | "title" | "date" | "institution" | "degree" | "certification" | "skill" | "metric" | "contact";
  value: string;
  where: string;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const numbersIn = (s: string) => (s.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ""));

function haystack(original: ResumeData): string {
  return norm(JSON.stringify(original));
}

function containsPhrase(hay: string, phrase: string): boolean {
  const p = norm(phrase);
  if (!p) return true;
  return ` ${hay} `.includes(` ${p} `);
}

export function findFabrications(original: ResumeData, tailored: ResumeData): Violation[] {
  const out: Violation[] = [];
  const hay = haystack(original);
  const origNumbers = new Set(numbersIn(JSON.stringify(original)).map((n) => n.replace(/^0+(?=\d)/, "")));

  const origByCompany = new Map(original.experience.map((e) => [norm(e.company), e]));
  for (const e of tailored.experience) {
    const o = origByCompany.get(norm(e.company));
    if (!o) {
      out.push({ kind: "company", value: e.company, where: "experience" });
      continue;
    }
    if (norm(e.title) !== norm(o.title)) out.push({ kind: "title", value: e.title, where: `experience: ${e.company}` });
    for (const field of ["start", "end"] as const) {
      if (e[field] && norm(e[field]) !== norm(o[field])) out.push({ kind: "date", value: String(e[field]), where: `experience: ${e.company}` });
    }
  }

  const origInst = new Set(original.education.map((e) => norm(e.institution)));
  const origDegrees = new Set(original.education.map((e) => norm(e.degree)).filter(Boolean));
  for (const e of tailored.education) {
    if (!origInst.has(norm(e.institution))) out.push({ kind: "institution", value: e.institution, where: "education" });
    else if (e.degree && !origDegrees.has(norm(e.degree))) out.push({ kind: "degree", value: e.degree, where: `education: ${e.institution}` });
  }

  const origCerts = new Set(original.certifications.map((c) => norm(c.name)));
  for (const c of tailored.certifications) {
    if (!origCerts.has(norm(c.name))) out.push({ kind: "certification", value: c.name, where: "certifications" });
  }

  for (const group of ["technical", "tools", "soft"] as const) {
    for (const s of tailored.skills[group]) {
      if (!containsPhrase(hay, s)) out.push({ kind: "skill", value: s, where: `skills.${group}` });
    }
  }

  const checkNumbers = (text: string, where: string) => {
    for (const n of numbersIn(text)) {
      const clean = n.replace(/^0+(?=\d)/, "");
      if (!origNumbers.has(clean)) out.push({ kind: "metric", value: n, where });
    }
  };
  for (const e of tailored.experience) for (const b of e.bullets) checkNumbers(b, `experience: ${e.company}`);
  for (const p of tailored.projects) for (const b of [...p.bullets, p.description ?? ""]) checkNumbers(b, `project: ${p.name}`);
  if (tailored.summary) checkNumbers(tailored.summary, "summary");

  const oc = original.contact;
  const tc = tailored.contact;
  for (const f of ["name", "email", "phone"] as const) {
    if (tc[f] && norm(tc[f]) !== norm(oc[f])) out.push({ kind: "contact", value: String(tc[f]), where: f });
  }
  return out;
}

/** Remove or restore anything `findFabrications` would flag. Always returns a resume that passes. */
export function repairFabrications(original: ResumeData, tailored: ResumeData): ResumeData {
  const hay = haystack(original);
  const origNumbers = new Set(numbersIn(JSON.stringify(original)).map((n) => n.replace(/^0+(?=\d)/, "")));
  const noNewNumbers = (text: string) => numbersIn(text).every((n) => origNumbers.has(n.replace(/^0+(?=\d)/, "")));
  const origByCompany = new Map(original.experience.map((e) => [norm(e.company), e]));

  const experience: ResumeData["experience"] = [];
  const seen = new Set<string>();
  for (const e of tailored.experience) {
    const o = origByCompany.get(norm(e.company));
    if (!o || seen.has(norm(e.company))) continue;
    seen.add(norm(e.company));
    experience.push({
      ...e,
      company: o.company,
      title: o.title,
      start: o.start,
      end: o.end,
      location: o.location,
      bullets: e.bullets.filter(noNewNumbers),
    });
  }
  // Never silently drop an employer: restore any that went missing.
  for (const o of original.experience) if (!seen.has(norm(o.company))) experience.push(o);
  experience.sort((a, b) => original.experience.findIndex((x) => norm(x.company) === norm(a.company)) - original.experience.findIndex((x) => norm(x.company) === norm(b.company)));

  const origInst = new Map(original.education.map((e) => [norm(e.institution), e]));
  const education = tailored.education
    .filter((e) => origInst.has(norm(e.institution)))
    .map((e) => ({ ...origInst.get(norm(e.institution))! }));
  for (const o of original.education) if (!education.some((e) => norm(e.institution) === norm(o.institution))) education.push(o);

  const origCerts = new Map(original.certifications.map((c) => [norm(c.name), c]));
  const certifications = tailored.certifications.filter((c) => origCerts.has(norm(c.name))).map((c) => origCerts.get(norm(c.name))!);

  const keepSkill = (s: string) => containsPhrase(hay, s);
  return {
    ...tailored,
    contact: original.contact,
    summary: tailored.summary && noNewNumbers(tailored.summary) ? tailored.summary : original.summary,
    skills: {
      technical: tailored.skills.technical.filter(keepSkill),
      tools: tailored.skills.tools.filter(keepSkill),
      soft: tailored.skills.soft.filter(keepSkill),
    },
    experience,
    education,
    certifications,
    projects: tailored.projects.map((p) => ({
      ...p,
      description: p.description && noNewNumbers(p.description) ? p.description : null,
      bullets: p.bullets.filter(noNewNumbers),
    })),
    totalYearsExperience: original.totalYearsExperience,
    seniority: original.seniority,
  };
}
