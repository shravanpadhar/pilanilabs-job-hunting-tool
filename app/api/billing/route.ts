import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { balance, ensureTrialCredits, grantCredits, recentLedger } from "@/lib/billing/credits";
import { env } from "@/lib/env";
import { AppError, handler } from "@/lib/errors";
import { getPricing } from "@/lib/settings";

export const runtime = "nodejs";

/** Credit balance, the packs on offer, and the latest ledger entries. */
export const GET = handler("billing_get", async () => {
  const user = await requireUserApi();
  await ensureTrialCredits(user.id);
  const [credits, pricing, ledger] = await Promise.all([balance(user.id), getPricing(), recentLedger(user.id, 15)]);
  return NextResponse.json({
    balance: credits,
    perTarget: pricing.creditsPerTarget + pricing.creditsPerVerify,
    packs: pricing.packs,
    // No payment processor is connected in this build: purchases only work with the fake gateway (local development).
    canBuy: process.env.NODE_ENV !== "production",
    ledger: ledger.map((l) => ({ id: l.id, delta: l.delta, reason: l.reason, createdAt: l.createdAt.toISOString() })),
  });
});

const bodySchema = z.object({ action: z.literal("buy"), packId: z.string().min(1).max(40) });

/** Fake gateway: grants the pack immediately. Refused in production until a real payment provider is wired in. */
export const POST = handler("billing_buy", async (request: Request) => {
  const user = await requireUserApi();
  const { packId } = bodySchema.parse(await request.json());
  if (process.env.NODE_ENV === "production" || env.appUrl.startsWith("https://")) {
    throw new AppError("Online payments are not switched on yet. Contact support to add credits.", 501, "payments_not_configured");
  }
  const pack = (await getPricing()).packs.find((p) => p.id === packId);
  if (!pack) throw new AppError("Unknown credit pack.", 404, "not_found");
  await grantCredits(user.id, pack.credits, "PURCHASE", "fake-checkout", `${packId}:${Date.now()}`);
  return NextResponse.json({ balance: await balance(user.id) });
});
