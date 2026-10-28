import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processOptOut } from "@/lib/outreach/optout-action";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/**
 * One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header. No session, the signed
 * token is the proof. GET (a link someone opened, or a mail scanner prefetching) only shows the confirmation page and
 * changes nothing, so scanners cannot unsubscribe people by accident (D-16).
 */
export async function POST(_request: Request, { params }: Ctx) {
  const { token } = await params;
  const res = await processOptOut(token);
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 400 });
}

export async function GET(_request: Request, { params }: Ctx) {
  const { token } = await params;
  return NextResponse.redirect(`${env.appUrl}/u/${encodeURIComponent(token)}`, 303);
}
