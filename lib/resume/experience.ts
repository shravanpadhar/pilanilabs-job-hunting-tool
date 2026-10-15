import type { ResumeData } from "@/lib/resume/schema";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const PRESENT = /^(present|current|now|ongoing|till date|to date|today)$/i;

/** Parse "Jan 2020", "01/2020", "2020", "Present" → month index since year 0, or null. */
export function parseMonthIndex(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (PRESENT.test(v)) return now.getFullYear() * 12 + now.getMonth();
  let m = v.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return Number(m[2]) * 12 + (Number(m[1]) - 1);
  m = v.match(/^([a-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi >= 0) return Number(m[2]) * 12 + mi;
  }
  m = v.match(/^(\d{4})$/);
  if (m) return Number(m[1]) * 12 + 5; // mid-year when only a year is known
  m = v.match(/(\d{4})/);
  if (m) return Number(m[1]) * 12 + 5;
  return null;
}

/** Total professional experience in years, merging overlapping roles. Null if no dates are usable. */
export function computeTotalYears(experience: ResumeData["experience"], now = new Date()): number | null {
  const ranges: Array<[number, number]> = [];
  for (const e of experience) {
    const s = parseMonthIndex(e.start, now);
    const en = parseMonthIndex(e.end ?? "present", now);
    if (s !== null && en !== null && en >= s) ranges.push([s, en]);
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curS, curE] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= curE) curE = Math.max(curE, e);
    else {
      total += curE - curS;
      [curS, curE] = [s, e];
    }
  }
  total += curE - curS;
  return Math.round((total / 12) * 10) / 10;
}

export function seniorityFromYears(years: number | null): ResumeData["seniority"] {
  if (years === null) return null;
  if (years < 1) return "entry";
  if (years < 3) return "junior";
  if (years < 6) return "mid";
  if (years < 10) return "senior";
  return "lead";
}

/** Experience band used to compare a candidate against a job. */
export function experienceBand(years: number | null): "fresher" | "junior" | "mid" | "senior" | "lead" | null {
  if (years === null) return null;
  if (years < 1) return "fresher";
  if (years < 3) return "junior";
  if (years < 6) return "mid";
  if (years < 10) return "senior";
  return "lead";
}
