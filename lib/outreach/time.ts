import { zonedParts, zonedToUtc } from "@/lib/outreach/schedule";

/** Midnight at the start of `now`'s calendar day in `tz`, as an instant (the daily send cap resets there). */
export function startOfLocalDay(now: Date, tz: string): Date {
  const p = zonedParts(now, tz);
  return zonedToUtc(p.y, p.m, p.d, 0, 0, tz);
}
