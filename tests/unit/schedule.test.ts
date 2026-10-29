import { describe, expect, it } from "vitest";
import { computeSchedule, formatInZone, inWorkingHours, isValidTimeZone, jitterMinutes, nextWorkingInstant, zonedParts, zonedToUtc } from "@/lib/outreach/schedule";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("time zone math", () => {
  it("converts local wall time to the right instant (fixed offset and DST zones)", () => {
    expect(zonedToUtc(2026, 11, 3, 9, 0, IST).toISOString()).toBe("2026-11-03T03:30:00.000Z"); // +05:30
    expect(zonedToUtc(2026, 7, 1, 9, 0, NY).toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT -04:00
    expect(zonedToUtc(2026, 12, 1, 9, 0, NY).toISOString()).toBe("2026-12-01T14:00:00.000Z"); // EST -05:00
  });
  it("round-trips through zonedParts", () => {
    const d = zonedToUtc(2026, 3, 8, 10, 30, NY); // US DST starts this day
    const p = zonedParts(d, NY);
    expect([p.y, p.m, p.d, p.h, p.mi]).toEqual([2026, 3, 8, 10, 30]);
  });
  it("validates zone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
  it("formats the same instant in two zones", () => {
    const d = new Date("2026-11-03T04:30:00Z");
    expect(formatInZone(d, IST)).toContain("10:00");
    expect(formatInZone(d, NY)).toContain("23:30");
  });
});

describe("working hours", () => {
  it("is Monday-Friday 09:00-17:00 local", () => {
    expect(inWorkingHours(zonedToUtc(2026, 11, 4, 10, 0, IST), IST)).toBe(true); // Wed
    expect(inWorkingHours(zonedToUtc(2026, 11, 4, 17, 0, IST), IST)).toBe(false);
    expect(inWorkingHours(zonedToUtc(2026, 11, 4, 8, 59, IST), IST)).toBe(false);
    expect(inWorkingHours(zonedToUtc(2026, 11, 7, 11, 0, IST), IST)).toBe(false); // Sat
    expect(inWorkingHours(zonedToUtc(2026, 11, 8, 11, 0, IST), IST)).toBe(false); // Sun
  });
  it("moves a send to the next working window instead of failing", () => {
    const sat = zonedToUtc(2026, 11, 7, 11, 0, IST);
    const next = nextWorkingInstant(sat, IST, "seed");
    expect(inWorkingHours(next, IST)).toBe(true);
    expect(zonedParts(next, IST).weekday).toBe(1); // Monday
    const lateFri = zonedToUtc(2026, 11, 6, 19, 0, IST);
    expect(zonedParts(nextWorkingInstant(lateFri, IST, "seed"), IST).weekday).toBe(1);
    const earlyWed = zonedToUtc(2026, 11, 4, 6, 0, IST);
    expect(zonedParts(nextWorkingInstant(earlyWed, IST, "seed"), IST).d).toBe(4); // same day
    const inside = zonedToUtc(2026, 11, 4, 11, 0, IST);
    expect(nextWorkingInstant(inside, IST, "seed")).toEqual(inside);
  });
});

describe("computeSchedule", () => {
  const steps = (now: string, tz = IST, seed = "t1", offset = 0) => computeSchedule({ now: new Date(now), recipientTz: tz, seed, offsetMinutes: offset });

  it("returns three steps on day 0, 3 and 7, in order, all inside working hours", () => {
    const s = steps("2026-11-03T05:00:00Z"); // Tue 10:30 IST
    expect(s.map((x) => x.step)).toEqual([1, 2, 3]);
    for (const x of s) expect(inWorkingHours(x.at, IST), x.at.toISOString()).toBe(true);
    const days = s.map((x) => Math.round((x.at.getTime() - s[0].at.getTime()) / 86_400_000));
    expect(days[0]).toBe(0);
    expect(days[1]).toBeGreaterThanOrEqual(3);
    expect(days[2]).toBeGreaterThanOrEqual(7);
  });

  it("sends the first email shortly after approval when it is already working hours", () => {
    const now = new Date("2026-11-03T05:00:00Z");
    const [first] = steps("2026-11-03T05:00:00Z");
    const mins = (first.at.getTime() - now.getTime()) / 60_000;
    expect(mins).toBeGreaterThanOrEqual(15);
    expect(mins).toBeLessThan(60);
  });

  it("waits for the next working morning when approved at night or on a weekend", () => {
    const night = steps("2026-11-03T18:00:00Z"); // Tue 23:30 IST
    expect(zonedParts(night[0].at, IST).d).toBe(4);
    const weekend = steps("2026-11-07T05:00:00Z"); // Sat
    expect(zonedParts(weekend[0].at, IST).weekday).toBe(1);
    const friNight = steps("2026-11-06T18:00:00Z");
    expect(zonedParts(friNight[0].at, IST).weekday).toBe(1);
  });

  it("never lands a follow-up on a weekend", () => {
    // First email Thu 5 Nov: day 3 is Sunday 8 Nov -> Monday; day 7 is Thu 12 Nov.
    const s = steps("2026-11-05T05:00:00Z");
    for (const x of s) expect([0, 6]).not.toContain(zonedParts(x.at, IST).weekday);
  });

  it("uses the recipient's zone: 09:00 in New York is not 09:00 in Kolkata", () => {
    const ny = steps("2026-11-03T05:00:00Z", NY); // Tue 00:00 EST -> first working slot is Tue morning in NY
    expect(zonedParts(ny[0].at, NY).h).toBeGreaterThanOrEqual(9);
    expect(inWorkingHours(ny[0].at, NY)).toBe(true);
    expect(zonedParts(ny[0].at, IST).h).not.toBe(zonedParts(ny[0].at, NY).h);
  });

  it("keeps the same local time-of-day across a DST change (US clocks go back on 1 Nov 2026)", () => {
    const s = steps("2026-10-30T13:00:00Z", NY); // Fri 30 Oct 09:00 EDT
    const hours = s.map((x) => zonedParts(x.at, NY).h);
    expect(new Set(hours).size).toBe(1); // 3 and 7 days later it is EST, still the same wall-clock hour
    expect(zonedParts(s[1].at, NY).d).toBe(2); // Mon 2 Nov
  });

  it("spreads several targets apart and is deterministic for a given seed", () => {
    const a = steps("2026-11-03T05:00:00Z", IST, "tA", 0)[0].at;
    const b = steps("2026-11-03T05:00:00Z", IST, "tB", 14)[0].at;
    expect(b.getTime()).toBeGreaterThan(a.getTime());
    expect(steps("2026-11-03T05:00:00Z", IST, "tA", 0)[0].at).toEqual(a);
    expect(jitterMinutes("x", 10)).toBe(jitterMinutes("x", 10));
    expect(jitterMinutes("x", 10)).toBeLessThanOrEqual(10);
  });
});
