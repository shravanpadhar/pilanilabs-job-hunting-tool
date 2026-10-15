import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts/run";
import { assertCron } from "@/lib/cron";
import { handler } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily at 03:30 UTC (09:00 IST): sends due daily / weekly digests and saved-search alerts. */
export const GET = handler("cron_send_alerts", async (request: Request) => {
  assertCron(request);
  return NextResponse.json(await runAlerts());
});
