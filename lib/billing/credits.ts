import type { CreditReason } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPricing } from "@/lib/settings";

/**
 * Credit ledger. An append-only list of +/- entries; the balance is their sum. Every posting carries (reason, refType, refId)
 * and the table is UNIQUE on (userId, reason, refType, refId), so the same event (the same target being charged, the same
 * refund, the same trial grant) can never post twice, whatever retries or races happen.
 */
export async function balance(userId: string): Promise<number> {
  const r = await db.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

type Posting = { userId: string; delta: number; reason: CreditReason; refType: string; refId: string };

/** Insert unless this exact event already exists. Returns true when it posted. */
export async function post(p: Posting): Promise<boolean> {
  try {
    await db.creditLedger.create({ data: p });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return false; // already posted
    throw err;
  }
}

/** One-time free trial credits for a new candidate (idempotent). */
export async function ensureTrialCredits(userId: string): Promise<void> {
  const { trialCredits } = await getPricing();
  if (trialCredits > 0) await post({ userId, delta: trialCredits, reason: "TRIAL_GRANT", refType: "trial", refId: userId });
}

/**
 * Charge credits for the given targets, all or nothing. The balance check and the inserts run in one SERIALIZABLE transaction
 * (retried on conflict), so two simultaneous activations can never spend the same credits twice.
 */
export async function spendForTargets(userId: string, targetIds: string[]): Promise<{ charged: number; cost: number }> {
  const { creditsPerTarget, creditsPerVerify } = await getPricing();
  const perTarget = creditsPerTarget + creditsPerVerify;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const already = await tx.creditLedger.findMany({ where: { userId, reason: "SPEND_TARGET", refType: "target", refId: { in: targetIds } }, select: { refId: true } });
          const todo = targetIds.filter((id) => !already.some((a) => a.refId === id));
          const cost = todo.length * perTarget;
          const sum = await tx.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } });
          const have = sum._sum.delta ?? 0;
          if (cost > have) throw new AppError(`You need ${cost} credits for ${todo.length} ${todo.length === 1 ? "person" : "people"} and have ${have}. Add credits to continue.`, 402, "insufficient_credits");
          if (perTarget > 0) for (const id of todo) await tx.creditLedger.create({ data: { userId, delta: -perTarget, reason: "SPEND_TARGET", refType: "target", refId: id } });
          return { charged: todo.length, cost };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      if ((err as { code?: string }).code === "P2034" && attempt < 3) continue; // serialization conflict: try again
      throw err;
    }
  }
  throw new AppError("Could not charge credits. Please try again.", 503, "credit_conflict");
}

/** Give a target's credit back when its email proved undeliverable (a hard bounce). Idempotent. */
export async function refundTarget(userId: string, targetId: string): Promise<boolean> {
  const spent = await db.creditLedger.findUnique({ where: { userId_reason_refType_refId: { userId, reason: "SPEND_TARGET", refType: "target", refId: targetId } } });
  if (!spent) return false;
  const posted = await post({ userId, delta: -spent.delta, reason: "REFUND", refType: "target", refId: targetId });
  if (posted) await audit({ userId, action: "credits.refunded", entityType: "OutreachTarget", entityId: targetId, detail: { credits: -spent.delta } });
  return posted;
}

/** Optional pay-on-reply charge for a real reply (interested / referral). Off unless enabled in settings. Idempotent per reply. */
export async function chargeForReply(userId: string, replyId: string): Promise<boolean> {
  const { payOnReply } = await getPricing();
  if (!payOnReply.enabled || payOnReply.credits <= 0) return false;
  return post({ userId, delta: -payOnReply.credits, reason: "REPLY_BONUS", refType: "reply", refId: replyId });
}

export async function grantCredits(userId: string, credits: number, reason: "PURCHASE" | "ADJUSTMENT", refType: string, refId: string, by?: string): Promise<boolean> {
  const posted = await post({ userId, delta: credits, reason, refType, refId });
  if (posted) await audit({ userId: by ?? userId, action: reason === "PURCHASE" ? "credits.purchased" : "credits.adjusted", entityType: "User", entityId: userId, detail: { credits, refType } });
  return posted;
}

export async function recentLedger(userId: string, take = 20) {
  return db.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}
