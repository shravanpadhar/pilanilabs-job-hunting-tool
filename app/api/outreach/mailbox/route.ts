import { NextResponse } from "next/server";
import { z } from "zod";
import { outreach } from "@/config/outreach";
import { requireUserApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clockNow } from "@/lib/clock";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { handler, notFound } from "@/lib/errors";
import { healthFor, resumeSending } from "@/lib/outreach/health";
import { effectiveDailyCap } from "@/lib/outreach/warmup";
import { getMailbox } from "@/lib/providers/mailbox";
import { listConnectedAccounts, markRevoked } from "@/lib/providers/mailbox/accounts";

export const runtime = "nodejs";

/** Connected mailboxes (never the token), today's allowance after warm-up, and whether sending is paused. */
export const GET = handler("outreach_mailbox_get", async () => {
  const user = await requireUserApi();
  const now = await clockNow();
  const [accounts, profile, health] = await Promise.all([listConnectedAccounts(user.id), db.outreachProfile.findUnique({ where: { userId: user.id } }), healthFor(user.id, now)]);
  return NextResponse.json({
    provider: getMailbox().name,
    sendingEnabled: env.outreachSendingEnabled,
    maxDailyCap: outreach.hardMaxDailySends,
    accounts: accounts.map((a) => ({ id: a.id, accountEmail: a.accountEmail, status: a.status, dailySendCap: a.dailySendCap, todayAllowance: effectiveDailyCap(a, now), warmupStage: a.warmupStage, lastError: a.lastError })),
    paused: profile?.sendingPausedAt ? { reason: profile.pauseReason, bySystem: profile.pausedBy === "SYSTEM" } : null,
    health,
  });
});

const bodySchema = z.union([
  z.object({ action: z.literal("set_cap"), accountId: z.string().min(1), dailySendCap: z.number().int().min(1).max(outreach.hardMaxDailySends) }),
  z.object({ action: z.literal("disconnect"), accountId: z.string().min(1) }),
  z.object({ action: z.literal("resume_sending") }),
]);

export const POST = handler("outreach_mailbox_update", async (request: Request) => {
  const user = await requireUserApi();
  const body = bodySchema.parse(await request.json());

  if (body.action === "resume_sending") {
    const ok = await resumeSending(user.id, "USER");
    return NextResponse.json({ ok, message: ok ? "Sending resumed." : "Sending was paused automatically because of bounces or complaints. Contact support to review and resume." }, { status: ok ? 200 : 409 });
  }

  const account = await db.connectedAccount.findFirst({ where: { id: body.accountId, userId: user.id }, select: { id: true } });
  if (!account) throw notFound("Mailbox");
  if (body.action === "set_cap") {
    await db.connectedAccount.update({ where: { id: account.id }, data: { dailySendCap: body.dailySendCap } });
    await audit({ userId: user.id, action: "mailbox.cap_changed", entityType: "ConnectedAccount", entityId: account.id, detail: { dailySendCap: body.dailySendCap } });
    return NextResponse.json({ ok: true });
  }

  // Disconnect: revoke the grant at the provider, wipe the token, and hold every running campaign (nothing is lost, nothing is sent).
  await getMailbox().revoke(account.id);
  await markRevoked(account.id, user.id);
  await db.outreachCampaign.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "PAUSED" } });
  return NextResponse.json({ ok: true });
});
