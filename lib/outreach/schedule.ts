import { createHash } from "node:crypto";
import { outreach } from "@/config/outreach";

/**
 * Scheduling math, pure and testable. Emails go out inside the RECIPIENT's local working hours (Monday-Friday),
 * on day 0 / 3 / 7 of the sequence, with a small deterministic jitter so sends do not all land on the minute.
 * Time zones are handled with Intl only (no dependency); DST is covered by tests.
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  weekday: number; // 0 = Sunday
}

export function zonedParts(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  return { y, m, d, h: Number(p.hour) % 24, mi: Number(p.minute), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** Local wall-clock time in `tz` to an instant. Two correction passes make it right across DST changes. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += wall - shown;
  }
  return new Date(guess);
}

const addDays = (y: number, m: number, d: number, n: number) => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay() };
};

/** Stable pseudo-random minutes from a seed, so the preview equals what the sender later uses. */
export const jitterMinutes = (seed: string, max: number) => parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 6), 16) % (max + 1);

export interface ScheduleOptions {
  now: Date;
  recipientTz: string;
  seed: string;
  /** Extra delay before the first email (spreads several targets of one campaign apart). */
  offsetMinutes?: number;
  dayOffsets?: readonly number[];
  window?: { startHour: number; endHour: number };
}

export function computeSchedule(opts: ScheduleOptions): Array<{ step: number; at: Date }> {
  const window = opts.window ?? outreach.workingHours;
  const days = opts.dayOffsets ?? outreach.sequenceDays;
  const tz = opts.recipientTz;
  const lastStartMinute = (window.endHour - 1) * 60; // never start in the last hour of the window

  const startOf = (y: number, m: number, d: number, extraMin: number) => {
    const total = Math.min(window.startHour * 60 + extraMin, lastStartMinute);
    return zonedToUtc(y, m, d, Math.floor(total / 60), total % 60, tz);
  };
  const nextWeekday = (y: number, m: number, d: number, weekday: number) => {
    const skip = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
    return addDays(y, m, d, skip);
  };

  const earliest = new Date(opts.now.getTime() + (15 + (opts.offsetMinutes ?? 0)) * 60_000);
  const p = zonedParts(earliest, tz);
  const jitter = jitterMinutes(opts.seed, 90);
  let first: Date;
  const minuteOfDay = p.h * 60 + p.mi;
  if (p.weekday >= 1 && p.weekday <= 5 && minuteOfDay >= window.startHour * 60 && minuteOfDay <= lastStartMinute) {
    first = earliest; // already inside working hours
  } else if (p.weekday >= 1 && p.weekday <= 5 && minuteOfDay < window.startHour * 60) {
    first = startOf(p.y, p.m, p.d, jitter); // earlier today
  } else {
    const tomorrow = addDays(p.y, p.m, p.d, 1);
    const t = nextWeekday(tomorrow.y, tomorrow.m, tomorrow.d, tomorrow.weekday);
    first = startOf(t.y, t.m, t.d, jitter);
  }

  const fp = zonedParts(first, tz);
  const timeOfDay = Math.min(Math.max(fp.h * 60 + fp.mi, window.startHour * 60), lastStartMinute);
  return days.map((offset, i) => {
    if (i === 0) return { step: 1, at: first };
    const dd = addDays(fp.y, fp.m, fp.d, offset);
    const t = nextWeekday(dd.y, dd.m, dd.d, dd.weekday);
    return { step: i + 1, at: zonedToUtc(t.y, t.m, t.d, Math.floor(timeOfDay / 60), timeOfDay % 60, tz) };
  });
}

/** "Tue 4 Nov, 10:30 AM" in a given zone (for the two-zone preview). */
export function formatInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/** Is `date` inside the recipient's Monday-Friday working window? Used again by the sender at send time. */
export function inWorkingHours(date: Date, tz: string, window = outreach.workingHours): boolean {
  const p = zonedParts(date, tz);
  const mod = p.h * 60 + p.mi;
  return p.weekday >= 1 && p.weekday <= 5 && mod >= window.startHour * 60 && mod < window.endHour * 60;
}

/** The next instant at or after `from` that is inside the working window (for rescheduling instead of failing). */
export function nextWorkingInstant(from: Date, tz: string, seed: string, window = outreach.workingHours): Date {
  if (inWorkingHours(from, tz, window)) return from;
  const p = zonedParts(from, tz);
  const jitter = jitterMinutes(seed, 60);
  const mod = p.h * 60 + p.mi;
  const weekday = p.weekday >= 1 && p.weekday <= 5;
  const startMin = Math.min(window.startHour * 60 + jitter, (window.endHour - 1) * 60);
  if (weekday && mod < window.startHour * 60) return zonedToUtc(p.y, p.m, p.d, Math.floor(startMin / 60), startMin % 60, tz);
  let n = addDays(p.y, p.m, p.d, 1);
  while (n.weekday === 0 || n.weekday === 6) n = addDays(n.y, n.m, n.d, 1);
  return zonedToUtc(n.y, n.m, n.d, Math.floor(startMin / 60), startMin % 60, tz);
}
