import { db } from "@/lib/db";
import { flags } from "@/lib/env";

/**
 * "Now" for the outreach engine. In production it is simply the current time. When EXTERNAL_FAKES is on (local dev and
 * e2e only, impossible in production) a stored offset lets tests jump days ahead to exercise the day-3 / day-7 follow-ups.
 */
const KEY = "dev.clockOffsetMs";

export async function clockNow(): Promise<Date> {
  if (!flags.externalFakes) return new Date();
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const ms = Number((row?.value as { ms?: number } | null)?.ms ?? 0);
  return new Date(Date.now() + ms);
}

export async function advanceClock(ms: number): Promise<Date> {
  if (!flags.externalFakes) throw new Error("The test clock is only available with EXTERNAL_FAKES.");
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const next = Number((row?.value as { ms?: number } | null)?.ms ?? 0) + ms;
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: { ms: next } }, update: { value: { ms: next } } });
  return clockNow();
}

export async function resetClock(): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: KEY } });
}
