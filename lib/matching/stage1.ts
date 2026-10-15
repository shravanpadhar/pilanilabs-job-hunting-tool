import { ROLE_SYNONYMS } from "@/config/skills";
import { matching } from "@/config/matching";
import { normalizeLocation } from "@/lib/sources/dedupe";
import { normalizeText, tokenOverlap } from "@/lib/matching/text";
import { clamp } from "@/lib/utils";

/** What stage 1 needs to know about the candidate. */
export interface Stage1Profile {
  skills: string[]; // canonical, lowercase
  roles: string[]; // target roles + inferred roles
  years: number | null;
  locations: string[];
  workModes: Array<"REMOTE" | "HYBRID" | "ONSITE">;
  jobTypes: Array<"FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP">;
  minSalary: number | null;
  currency: string;
  keywordsInclude: string[];
  keywordsExclude: string[];
  countries: string[]; // ISO2 lowercase, default ["in"]
}

export interface Stage1Job {
  id: string;
  title: string;
  location: string | null;
  country: string | null;
  isRemote: boolean;
  employmentType: string | null;
  salaryMax: number | null;
  salaryMin: number | null;
  salaryCurrency: string | null;
  descriptionText: string;
  skills: string[];
}

export interface Stage1Result {
  score: number;
  matchingSkills: string[];
  missingSkills: string[];
  experienceFit: "under" | "fit" | "over" | null;
  reason: string;
}

const SENIOR_TITLE = /\b(senior|sr\.?|lead|principal|staff|head|director|vp|architect|manager)\b/i;
const JUNIOR_TITLE = /\b(junior|jr\.?|associate|entry|graduate|trainee|intern|fresher)\b/i;

/** Years of experience a posting asks for, e.g. "3+ years", "5-8 years". */
export function requiredYears(text: string): number | null {
  const t = text.toLowerCase();
  const range = t.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)/);
  if (range) return Number(range[1]);
  const plus = t.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)(?:\s+of)?\s+(?:relevant\s+|professional\s+|work\s+|hands[- ]on\s+)?(?:experience|exp)/);
  if (plus) return Number(plus[1]);
  const min = t.match(/(?:minimum|at least|min\.?)\s*(?:of\s*)?(\d{1,2})\s*(?:years|yrs)/);
  return min ? Number(min[1]) : null;
}

const FOREIGN_REGION = /\b(usa|u\.s\.|us only|united states|canada|europe|eu only|emea|uk only|united kingdom|germany|latam|latin america|australia|brazil|mexico|netherlands|france|spain|poland|ireland|nordics?)\b/i;
const OPEN_REGION = /\b(worldwide|anywhere|global|any location|apac|asia|international|remote)\b/i;

const COUNTRY_WORDS: Record<string, RegExp> = {
  in: /\b(india|apac|asia|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|gurugram|gurgaon|noida|kolkata|ahmedabad)\b/i,
  us: /\b(usa|u\.s\.|united states|us)\b/i,
  gb: /\b(uk|united kingdom|england)\b/i,
  ca: /\bcanada\b/i,
  de: /\b(germany|europe|emea|eu)\b/i,
  ae: /\b(uae|dubai|middle east)\b/i,
  sg: /\b(singapore|apac|asia)\b/i,
};

/** A "remote" job is only useful if the candidate's country is allowed. */
export function remoteEligible(locationText: string | null, countries: string[]): boolean {
  if (!locationText) return true;
  if (countries.some((c) => COUNTRY_WORDS[c]?.test(locationText))) return true;
  if (/(worldwide|anywhere|global)/i.test(locationText)) return true;
  if (FOREIGN_REGION.test(locationText)) return false;
  // A specific place we don't recognise (e.g. "Bielefeld") means the role is tied to that country.
  return OPEN_REGION.test(locationText);
}

function locationMatches(job: Stage1Job, profile: Stage1Profile): boolean {
  const jobLoc = normalizeText(job.location ?? "");
  const jobCity = normalizeLocation(job.location, job.isRemote);
  return profile.locations.some((l) => {
    const want = normalizeText(l);
    if (!want || want === "remote") return false;
    const wantCity = normalizeLocation(l, false);
    return (
      jobLoc.includes(want) ||
      jobCity === wantCity ||
      jobLoc.includes(wantCity) ||
      (want === "india" && (job.country === "in" || jobLoc.includes("india")))
    );
  });
}

function expandRoles(roles: string[]): string[] {
  const out = new Set<string>();
  for (const r of roles) {
    const role = r.toLowerCase().trim();
    if (!role) continue;
    out.add(role);
    for (const [canonical, syns] of Object.entries(ROLE_SYNONYMS)) {
      if (role.includes(canonical) || syns.some((s) => role.includes(s))) {
        out.add(canonical);
        syns.forEach((s) => out.add(s));
      }
    }
  }
  return Array.from(out);
}

function titleScore(title: string, roles: string[]): number {
  if (!roles.length) return 0.4; // no stated preference — don't punish
  const t = normalizeText(title);
  let best = 0;
  for (const r of expandRoles(roles)) {
    const n = normalizeText(r);
    if (t.includes(n)) return 1;
    best = Math.max(best, tokenOverlap(n, t));
  }
  return best;
}

/**
 * Stage 1 (no AI): deterministic filters and a 0-100 relevance score from skill overlap,
 * title similarity, experience fit and location / work-mode fit. Returns null when a hard
 * filter rejects the job (wrong location, work mode, job type, salary, or exclusion keyword).
 */
export function scoreStage1(profile: Stage1Profile, job: Stage1Job): Stage1Result | null {
  const titleAndBody = `${job.title}\n${job.descriptionText}`.toLowerCase();

  // ── Hard filters ────────────────────────────────────────────────────────────
  if (profile.keywordsExclude.some((k) => k.trim() && titleAndBody.includes(k.trim().toLowerCase()))) return null;

  const wantsRemoteOnly = profile.workModes.length > 0 && profile.workModes.every((m) => m === "REMOTE");
  const remoteOk = profile.workModes.length === 0 || profile.workModes.includes("REMOTE") || profile.locations.some((l) => l.toLowerCase() === "remote");
  const allowsOnsite = profile.workModes.length === 0 || profile.workModes.some((m) => m !== "REMOTE");
  const placeMatch = locationMatches(job, profile);
  const hasPlacePref = profile.locations.some((l) => l.toLowerCase() !== "remote" && l.trim());

  let locationFit: number;
  if (job.isRemote) {
    if (!remoteEligible(job.location, profile.countries) && !placeMatch) return null;
    locationFit = remoteOk ? 1 : placeMatch ? 0.7 : 0.4;
    if (wantsRemoteOnly || remoteOk) locationFit = 1;
  } else {
    if (wantsRemoteOnly) return null;
    if (hasPlacePref && !placeMatch) return null;
    if (!allowsOnsite) return null;
    locationFit = placeMatch || !hasPlacePref ? 1 : 0.2;
  }

  if (profile.jobTypes.length && job.employmentType && !profile.jobTypes.includes(job.employmentType as never)) return null;

  if (profile.minSalary && job.salaryMax && job.salaryCurrency === profile.currency && job.salaryMax < profile.minSalary) return null;

  const req = requiredYears(job.descriptionText) ?? (SENIOR_TITLE.test(job.title) ? 5 : JUNIOR_TITLE.test(job.title) ? 0 : null);
  if (profile.years !== null && req !== null && req - profile.years > 4) return null;

  // ── Scoring ─────────────────────────────────────────────────────────────────
  const have = new Set(profile.skills);
  const jobSkills = job.skills;
  const matchingSkills = jobSkills.filter((s) => have.has(s));
  const missingSkills = jobSkills.filter((s) => !have.has(s));
  const denominator = Math.max(1, Math.min(jobSkills.length, 10));
  const skillFit = jobSkills.length ? Math.min(1, matchingSkills.length / denominator) : profile.skills.length ? 0.35 : 0;

  const roleFit = titleScore(job.title, profile.roles);

  let experienceFit: Stage1Result["experienceFit"] = null;
  let expScore = 0.6;
  if (profile.years !== null) {
    if (req !== null && profile.years + 1 < req) {
      experienceFit = "under";
      expScore = Math.max(0, 1 - (req - profile.years) * 0.25);
    } else if (req !== null && profile.years > req + 6) {
      experienceFit = "over";
      expScore = 0.55;
    } else if (JUNIOR_TITLE.test(job.title) && profile.years > 6) {
      experienceFit = "over";
      expScore = 0.5;
    } else {
      experienceFit = "fit";
      expScore = 1;
    }
  }

  const include = profile.keywordsInclude.filter((k) => k.trim() && titleAndBody.includes(k.trim().toLowerCase())).length;
  const bonus = Math.min(8, include * 4);

  const score = clamp(Math.round(100 * (0.45 * skillFit + 0.3 * roleFit + 0.1 * expScore + 0.15 * locationFit) + bonus), 0, 100);
  if (score < matching.minStage1Score) return null;

  const reason =
    matchingSkills.length > 0
      ? `Matches ${matchingSkills.length} of ${jobSkills.length} skills asked for (${matchingSkills.slice(0, 3).join(", ")})${roleFit >= 0.6 ? " and the role fits your targets" : ""}.`
      : roleFit >= 0.6
        ? "The role title fits your target roles."
        : "Partial match on role and location.";

  return { score, matchingSkills: matchingSkills.slice(0, 8), missingSkills: missingSkills.slice(0, 6), experienceFit, reason };
}
