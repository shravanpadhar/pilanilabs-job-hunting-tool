import { AI_DAILY_LIMITS, type AiFeature } from "@/config/ai";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { daysAgo } from "@/lib/utils";

/**
 * Per-user rolling-24h limit for AI endpoints, counted from the AiUsage table
 * (every Claude call is logged there by lib/ai/client.ts).
 */
export async function assertAiQuota(userId: string, feature: AiFeature): Promise<void> {
  const limit = AI_DAILY_LIMITS[feature];
  const used = await db.aiUsage.count({ where: { userId, feature, createdAt: { gte: daysAgo(1) } } });
  if (used >= limit) {
    throw new AppError(
      `You've reached today's limit of ${limit} requests for this feature. It resets on a rolling 24-hour basis.`,
      429,
      "rate_limited",
    );
  }
}
