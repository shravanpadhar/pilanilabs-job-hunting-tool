import { outreach } from "@/config/outreach";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { daysAgo } from "@/lib/utils";

/** Record the cost of one licensed-provider call against a candidate (margin control, spec C2 / section 9). */
export async function recordProviderUsage(userId: string, provider: string, operation: string, costMicros: number): Promise<void> {
  if (costMicros <= 0) return;
  await db.providerUsage.create({ data: { userId, provider, operation, costMicros: Math.round(costMicros) } });
}

/** AI + data-provider spend for a candidate over the rolling cost window, in micro-dollars. */
export async function candidateSpendMicros(userId: string, windowDays: number = outreach.costWindowDays): Promise<number> {
  const since = daysAgo(windowDays);
  const [provider, ai] = await Promise.all([
    db.providerUsage.aggregate({ where: { userId, createdAt: { gte: since } }, _sum: { costMicros: true } }),
    db.aiUsage.aggregate({ where: { userId, createdAt: { gte: since } }, _sum: { costMicros: true } }),
  ]);
  return (provider._sum.costMicros ?? 0) + (ai._sum.costMicros ?? 0);
}

export async function costCeilingMicros(userId: string): Promise<number> {
  const profile = await db.outreachProfile.findUnique({ where: { userId }, select: { costCeilingMicros: true } });
  return profile?.costCeilingMicros ?? outreach.costCeilingMicros;
}

/** Hard per-candidate ceiling: call before any paid provider or AI call that outreach triggers. */
export async function assertWithinCostCeiling(userId: string): Promise<void> {
  const [spent, ceiling] = await Promise.all([candidateSpendMicros(userId), costCeilingMicros(userId)]);
  if (spent >= ceiling) {
    throw new AppError("You have reached the usage limit for outreach lookups this month. Please contact support to raise it.", 402, "cost_ceiling");
  }
}
