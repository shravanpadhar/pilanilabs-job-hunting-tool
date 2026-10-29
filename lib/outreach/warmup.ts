import { outreach } from "@/config/outreach";

/**
 * Warm-up ramp: a freshly connected mailbox may only send a few emails a day, rising over two weeks, so a new
 * sending pattern does not look like spam. The candidate's own cap and a hard ceiling apply on top.
 */
export function warmupStageFor(connectedAt: Date, now: Date): number {
  const days = Math.max(0, Math.floor((now.getTime() - connectedAt.getTime()) / 86_400_000));
  let stage = 0;
  outreach.warmup.forEach((w, i) => {
    if (days >= w.fromDay) stage = i;
  });
  return stage;
}

export function warmupCap(connectedAt: Date, now: Date): number {
  return outreach.warmup[warmupStageFor(connectedAt, now)].cap;
}

/** The number of emails this mailbox may send today. */
export function effectiveDailyCap(account: { dailySendCap: number; connectedAt: Date }, now: Date): number {
  return Math.max(0, Math.min(account.dailySendCap, warmupCap(account.connectedAt, now), outreach.hardMaxDailySends));
}
