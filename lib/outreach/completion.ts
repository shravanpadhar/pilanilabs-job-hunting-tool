import { clockNow } from "@/lib/clock";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Journey 4 (nothing happens): a person whose sequence has run its course with no reply is COMPLETED a few days after the
 * last email, and a campaign whose people are all finished is COMPLETED. The candidate then sees the result and is offered
 * the next three people. Runs inside the 5-minute tick.
 */
const GRACE_DAYS = 3;
const TERMINAL = ["REPLIED", "BOUNCED", "OPTED_OUT", "COMPLETED", "CANCELLED"];

export async function completeFinishedSequences(now?: Date): Promise<{ targets: number; campaigns: number }> {
  const at = now ?? (await clockNow());
  const cutoff = new Date(at.getTime() - GRACE_DAYS * 86_400_000);

  const candidates = await db.outreachTarget.findMany({
    where: { state: "SENT", campaign: { status: { in: ["ACTIVE", "PAUSED"] } } },
    include: { messages: { where: { channel: "EMAIL" } }, campaign: { select: { userId: true } } },
    take: 500,
  });
  let targets = 0;
  for (const t of candidates) {
    const stillPending = t.messages.some((m) => ["APPROVED", "SCHEDULED", "SENDING"].includes(m.state));
    const lastSent = t.messages.filter((m) => m.state === "SENT" && m.sentAt).map((m) => m.sentAt!.getTime());
    if (stillPending || lastSent.length === 0 || Math.max(...lastSent) > cutoff.getTime()) continue;
    await db.outreachTarget.update({ where: { id: t.id }, data: { state: "COMPLETED" } });
    await audit({ userId: t.campaign.userId, action: "sequence.completed", entityType: "OutreachTarget", entityId: t.id });
    targets++;
  }

  const active = await db.outreachCampaign.findMany({ where: { status: "ACTIVE" }, include: { targets: { select: { state: true } } }, take: 500 });
  let campaigns = 0;
  for (const c of active) {
    if (c.targets.length > 0 && c.targets.every((t) => TERMINAL.includes(t.state))) {
      await db.outreachCampaign.update({ where: { id: c.id }, data: { status: "COMPLETED", finishedAt: at } });
      await audit({ userId: c.userId, action: "campaign.completed", entityType: "OutreachCampaign", entityId: c.id });
      campaigns++;
    }
  }
  return { targets, campaigns };
}
