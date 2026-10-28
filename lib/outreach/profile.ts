import { z } from "zod";
import type { OutreachProfile } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isValidTimeZone } from "@/lib/outreach/schedule";
import { e164 } from "@/lib/validation";

/** Sender identity and sending preferences: the footer of every email is built from this (spec: honest sender identity). */
export const outreachProfileSchema = z.object({
  senderName: z.string().trim().min(2, "Enter the name recipients should see.").max(100),
  postalAddress: z.string().trim().min(10, "Enter a postal address (a PO box or mail-forwarding address is fine).").max(300),
  timeZone: z.string().trim().refine(isValidTimeZone, "Choose a valid time zone, for example Asia/Kolkata."),
  notifyEmail: z.boolean().default(true),
  notifyWhatsapp: z.boolean().default(false),
  whatsappNumber: e164.nullable().or(z.literal("").transform(() => null)).default(null),
});
export type OutreachProfileInput = z.input<typeof outreachProfileSchema>;

export type CompleteProfile = OutreachProfile & { senderName: string; postalAddress: string };

export function isProfileComplete(p: OutreachProfile | null): p is CompleteProfile {
  return Boolean(p?.senderName && p.postalAddress && p.timeZone);
}

export async function getOutreachProfile(userId: string) {
  return db.outreachProfile.findUnique({ where: { userId } });
}

export async function requireCompleteProfile(userId: string): Promise<CompleteProfile> {
  const p = await getOutreachProfile(userId);
  if (!isProfileComplete(p)) {
    throw new AppError("Add your sender name and postal address before drafting or sending. Every email must carry them.", 400, "profile_incomplete");
  }
  return p;
}

export async function saveOutreachProfile(userId: string, input: unknown) {
  const data = outreachProfileSchema.parse(input);
  if (data.notifyWhatsapp && !data.whatsappNumber) throw new AppError("Add a WhatsApp number to turn WhatsApp notifications on.", 400, "validation");
  const saved = await db.outreachProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await audit({ userId, action: "outreach_profile.saved", entityType: "OutreachProfile", entityId: userId });
  return saved;
}
