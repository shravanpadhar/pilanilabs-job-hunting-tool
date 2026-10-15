import type { ResumeData } from "@/lib/resume/schema";

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export interface ResumeDiff {
  summaryChanged: boolean;
  /** Bullets in the tailored resume whose wording differs from every original bullet. */
  changedBullets: Set<string>;
  /** Original bullets that were dropped. */
  removedBullets: string[];
  /** Skills that moved to the front or were removed. */
  removedSkills: string[];
  reorderedSkills: boolean;
}

export function diffResumes(original: ResumeData, tailored: ResumeData): ResumeDiff {
  const origBullets = new Set([...original.experience, ...original.projects].flatMap((e) => e.bullets).map(key));
  const newBullets = [...tailored.experience, ...tailored.projects].flatMap((e) => e.bullets);
  const changedBullets = new Set(newBullets.filter((b) => !origBullets.has(key(b))));
  const tailoredKeys = new Set(newBullets.map(key));
  const removedBullets = [...original.experience, ...original.projects].flatMap((e) => e.bullets).filter((b) => !tailoredKeys.has(key(b)));

  const flatSkills = (r: ResumeData) => [...r.skills.technical, ...r.skills.tools, ...r.skills.soft];
  const o = flatSkills(original);
  const t = flatSkills(tailored);
  const tSet = new Set(t.map(key));
  return {
    summaryChanged: key(original.summary ?? "") !== key(tailored.summary ?? ""),
    changedBullets,
    removedBullets,
    removedSkills: o.filter((s) => !tSet.has(key(s))),
    reorderedSkills: o.map(key).filter((s) => tSet.has(s)).join("|") !== t.map(key).filter((s) => o.map(key).includes(s)).join("|"),
  };
}

export function exportFileName(resume: ResumeData, company: string, ext: "pdf" | "docx"): string {
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return `${[safe(resume.contact.name ?? "Resume"), safe(company), "Resume"].filter(Boolean).join("_")}.${ext}`;
}
