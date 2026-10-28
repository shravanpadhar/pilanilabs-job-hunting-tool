import { audit } from "@/lib/audit";
import { verifyOptOutToken } from "@/lib/compliance/optout";
import { addSuppression } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";

/**
 * A recipient opts out (link or one-click POST). The effect is immediate and by rule: the address goes on the global
 * suppression list, every unsent message to that person is cancelled, and the target is marked OPTED_OUT. Idempotent.
 */
export async function processOptOut(token: string): Promise<{ ok: boolean; senderName?: string }> {
  const targetId = verifyOptOutToken(token);
  if (!targetId) return { ok: false };
  const target = await db.outreachTarget.findUnique({ where: { id: targetId }, include: { campaign: { select: { userId: true, id: true } } } });
  if (!target) return { ok: false };

  if (target.email) await addSuppression(target.email, "OPT_OUT");
  await db.outreachMessage.updateMany({ where: { targetId, state: { in: ["DRAFT", "APPROVED", "SCHEDULED", "FAILED"] } }, data: { state: "CANCELLED", scheduledAt: null } });
  if (target.state !== "OPTED_OUT") await db.outreachTarget.update({ where: { id: targetId }, data: { state: "OPTED_OUT" } });
  await audit({ userId: target.campaign.userId, action: "recipient.opted_out", entityType: "OutreachTarget", entityId: targetId, detail: { via: "link" } });
  const profile = await db.outreachProfile.findUnique({ where: { userId: target.campaign.userId }, select: { senderName: true } });
  return { ok: true, senderName: profile?.senderName ?? undefined };
}

/** Name of the sender for the confirmation page, without changing anything. */
export async function optOutPreview(token: string): Promise<{ valid: boolean; senderName?: string }> {
  const targetId = verifyOptOutToken(token);
  if (!targetId) return { valid: false };
  const t = await db.outreachTarget.findUnique({ where: { id: targetId }, select: { campaign: { select: { userId: true } } } });
  if (!t) return { valid: false };
  const p = await db.outreachProfile.findUnique({ where: { userId: t.campaign.userId }, select: { senderName: true } });
  return { valid: true, senderName: p?.senderName ?? undefined };
}
