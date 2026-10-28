import type { z } from "zod";
import { limitsSchema, pricingSchema, type Limits, type Pricing } from "@/config/pricing";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Admin-editable settings layered over config defaults. Each key has a Zod schema: a stored value that no longer validates
 * is ignored (the safe default applies) and a write is rejected, so a bad edit can never break pricing or limits.
 */
const SCHEMAS = { pricing: pricingSchema, limits: limitsSchema } as const;
type Schemas = typeof SCHEMAS;
export type SettingKey = keyof Schemas;
export type SettingValue<K extends SettingKey> = z.output<Schemas[K]>;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await db.appSetting.findUnique({ where: { key } });
  const parsed = SCHEMAS[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SCHEMAS[key].parse({})) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: unknown, by: string): Promise<SettingValue<K>> {
  const parsed = SCHEMAS[key].parse(value) as SettingValue<K>;
  await db.appSetting.upsert({ where: { key }, create: { key, value: parsed as object }, update: { value: parsed as object } });
  await audit({ userId: by, action: "setting.changed", entityType: "AppSetting", entityId: key, detail: parsed });
  return parsed;
}

export const getPricing = (): Promise<Pricing> => getSetting("pricing");
export const getLimits = (): Promise<Limits> => getSetting("limits");
