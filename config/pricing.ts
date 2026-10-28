import { z } from "zod";

/**
 * Pricing and credit rules: DEFAULTS only. Nothing here is hard-coded in feature code; the admin console can override any of
 * it through the AppSetting table (see lib/settings.ts). Prices are placeholders to be set after the pilot measures the real
 * cost of one campaign (spec section 10): they are not a commercial decision.
 */
export const pricingSchema = z.object({
  /** Free outreach credits every new candidate receives once (hybrid model, spec section 10). */
  trialCredits: z.number().int().min(0).default(5),
  /** One credit per verified target contacted (spec section 10). */
  creditsPerTarget: z.number().int().min(0).default(1),
  /** Extra credits charged per paid email verification; 0 means verification is included in the target price. */
  creditsPerVerify: z.number().int().min(0).default(0),
  /** Optional "pay on reply" charge when a REAL reply (interested or referral) arrives. Off by default. */
  payOnReply: z.object({ enabled: z.boolean().default(false), credits: z.number().int().min(0).default(1) }).default({ enabled: false, credits: 1 }),
  /** Purchasable packs. Prices are in minor units (paise / cents) per currency. */
  packs: z
    .array(z.object({ id: z.string(), credits: z.number().int().min(1), price: z.object({ INR: z.number().int().min(0), USD: z.number().int().min(0) }) }))
    .default([
      { id: "starter", credits: 10, price: { INR: 0, USD: 0 } },
      { id: "standard", credits: 30, price: { INR: 0, USD: 0 } },
    ]),
  /** What one credit is worth to us, used only for margin estimates in the admin console (micro-dollars). */
  creditValueMicros: z.number().int().min(0).default(0),
});
export type Pricing = z.output<typeof pricingSchema>;
export const PRICING_DEFAULTS: Pricing = pricingSchema.parse({});

export const limitsSchema = z.object({
  /** Per-candidate rolling-30-day cost ceiling (AI + data providers), micro-dollars. */
  costCeilingMicros: z.number().int().min(0).default(5_000_000),
});
export type Limits = z.output<typeof limitsSchema>;
export const LIMIT_DEFAULTS: Limits = limitsSchema.parse({});
