import type { Preferences } from "@/generated/prisma/client";
import { extractSkills } from "@/lib/matching/text";
import type { CandidateProfile } from "@/lib/ai/score-matches";
import type { Stage1Profile } from "@/lib/matching/stage1";
import { allSkills, type ResumeData } from "@/lib/resume/schema";
import { countryFromText } from "@/lib/sources/normalize";
import { sha256, uniq } from "@/lib/utils";

export type PreferencesLike = Pick<
  Preferences,
  "targetRoles" | "locations" | "workModes" | "minSalary" | "currency" | "experienceLevel" | "jobTypes" | "keywordsInclude" | "keywordsExclude"
>;

export const EMPTY_PREFERENCES: PreferencesLike = {
  targetRoles: [],
  locations: [],
  workModes: [],
  minSalary: null,
  currency: "INR",
  experienceLevel: null,
  jobTypes: [],
  keywordsInclude: [],
  keywordsExclude: [],
};

/** Canonical skills the candidate has: listed skills plus skills evidenced in experience / projects. */
export function candidateSkills(resume: ResumeData): string[] {
  const listed = allSkills(resume).map((s) => s.toLowerCase());
  const evidence = [
    ...resume.experience.flatMap((e) => [e.title, ...e.bullets]),
    ...resume.projects.flatMap((p) => [p.name, p.description ?? "", ...p.tech, ...p.bullets]),
    resume.summary ?? "",
  ].join("\n");
  const canonical = extractSkills(`${allSkills(resume).join(", ")}\n${evidence}`);
  return uniq([...canonical, ...listed]);
}

export function buildProfiles(resumeId: string, resume: ResumeData, prefs: PreferencesLike) {
  const skills = candidateSkills(resume);
  const roles = uniq([...prefs.targetRoles, ...(prefs.targetRoles.length ? [] : resume.inferredTargetRoles)].map((r) => r.trim()).filter(Boolean));
  const detected = prefs.locations.map((l) => countryFromText(l)).filter((c): c is string => Boolean(c));
  const countries = detected.length ? uniq(detected) : ["in"];

  const stage1: Stage1Profile = {
    skills,
    roles,
    years: resume.totalYearsExperience,
    locations: prefs.locations,
    workModes: prefs.workModes,
    jobTypes: prefs.jobTypes,
    minSalary: prefs.minSalary,
    currency: prefs.currency,
    keywordsInclude: prefs.keywordsInclude,
    keywordsExclude: prefs.keywordsExclude,
    countries,
  };

  const ai: CandidateProfile = {
    targetRoles: roles,
    skills: skills.slice(0, 40),
    totalYearsExperience: resume.totalYearsExperience,
    seniority: resume.seniority,
    locations: prefs.locations,
    workModes: prefs.workModes,
    minSalary: prefs.minSalary,
    currency: prefs.currency,
    headline: resume.experience[0] ? `${resume.experience[0].title} at ${resume.experience[0].company}` : null,
  };

  const hash = sha256(
    JSON.stringify({ resumeId, skills: [...skills].sort(), roles: [...roles].sort(), years: stage1.years, p: { ...prefs, targetRoles: undefined } }),
  ).slice(0, 24);

  return { stage1, ai, hash };
}
