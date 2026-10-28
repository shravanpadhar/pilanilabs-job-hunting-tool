import { NextResponse } from "next/server";
import { assertCron } from "@/lib/cron";
import { handler } from "@/lib/errors";
import { evaluateAllHealth } from "@/lib/outreach/health";
import { dispatchDueMessages } from "@/lib/outreach/send";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Fallback trigger for the sender tick (the primary one is the Inngest cron, which runs every 5 minutes). Safe to call
 * any time and any number of times: sending is idempotent. Protected by the cron bearer secret.
 */
export const GET = handler("cron_outreach_tick", async (request: Request) => {
  assertCron(request);
  const dispatched = await dispatchDueMessages();
  const paused = await evaluateAllHealth();
  return NextResponse.json({ ...dispatched, paused });
});
