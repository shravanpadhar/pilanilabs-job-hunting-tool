import { z } from "zod";
import { filtersSchema } from "@/lib/jobs/filters";

const tag = z.string().trim().min(1).max(80);

export const preferencesSchema = z.object({
  targetRoles: z.array(tag).max(10).default([]),
  locations: z.array(tag).max(10).default([]),
  workModes: z.array(z.enum(["REMOTE", "HYBRID", "ONSITE"])).default([]),
  minSalary: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  currency: z.enum(["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"]).default("INR"),
  experienceLevel: z.enum(["fresher", "junior", "mid", "senior", "lead"]).nullable().default(null),
  jobTypes: z.array(z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"])).default([]),
  keywordsInclude: z.array(tag).max(15).default([]),
  keywordsExclude: z.array(tag).max(15).default([]),
  noticePeriodDays: z.number().int().min(0).max(365).nullable().default(null),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

/** E.164 phone number, e.g. +919876543210 */
export const e164 = z.string().regex(/^\+[1-9]\d{9,14}$/, "Use international format, e.g. +919876543210");

export const alertSettingsSchema = z.object({
  alertFrequency: z.enum(["OFF", "DAILY", "WEEKLY"]),
  alertEmail: z.boolean(),
  alertWhatsapp: z.boolean(),
  whatsappNumber: e164.nullable().or(z.literal("").transform(() => null)),
  alertMinScore: z.number().int().min(40).max(95),
});

export const applicationStatusSchema = z.enum(["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED"]);

export const idSchema = z.string().min(1).max(64);

export const savedSearchSchema = z.object({
  name: z.string().trim().min(1, "Give your search a name.").max(60),
  filters: filtersSchema,
  alertFrequency: z.enum(["OFF", "DAILY", "WEEKLY"]).default("OFF"),
  alertEmail: z.boolean().default(true),
  alertWhatsapp: z.boolean().default(false),
});
