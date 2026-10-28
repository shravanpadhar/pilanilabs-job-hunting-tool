import { outreach } from "@/config/outreach";
import { timeZoneForCountry } from "@/config/regions";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { composeEmailText, emailFooter } from "@/lib/compliance/optout";
import { computeSchedule, formatInZone, jitterMinutes } from "@/lib/outreach/schedule";
import { getOutreachProfile, isProfileComplete } from "@/lib/outreach/profile";

/** Recipient zone: from the contact's country when known, otherwise the candidate's own (D-13). */
export const recipientZone = (country: string | null, candidateTz: string) => timeZoneForCountry(country, candidateTz);

/** Per-target planned send times shown in BOTH time zones (spec journey 2, step 3). Pure of side effects. */
export async function previewSchedule(userId: string, campaignId: string, now = new Date()) {
  const campaign = await db.outreachCampaign.findFirst({
    where: { id: campaignId, userId },
    include: { targets: { where: { state: { notIn: ["CANCELLED", "OPTED_OUT", "BOUNCED"] } }, orderBy: { createdAt: "asc" } } },
  });
  if (!campaign) throw notFound("Campaign");
  const profile = await getOutreachProfile(userId);
  const candidateTz = profile?.timeZone ?? "Asia/Kolkata";

  return {
    candidateTz,
    targets: campaign.targets.map((t, i) => {
      const rz = recipientZone(t.country, candidateTz);
      const offset = i * (outreach.minSpacingMinutes + jitterMinutes(t.id, outreach.spacingJitterMinutes));
      const steps = computeSchedule({ now, recipientTz: rz, seed: t.id, offsetMinutes: offset }).map((s) => ({
        step: s.step,
        at: s.at.toISOString(),
        candidateLocal: formatInZone(s.at, candidateTz),
        recipientLocal: formatInZone(s.at, rz),
      }));
      return { targetId: t.id, fullName: t.fullName, recipientTz: rz, recipientTzAssumed: !t.country, steps };
    }),
  };
}

/** What the footer will look like (shown read-only under every email draft). */
export async function footerPreview(userId: string): Promise<string | null> {
  const p = await getOutreachProfile(userId);
  if (!isProfileComplete(p)) return null;
  return emailFooter({ senderName: p.senderName, postalAddress: p.postalAddress, targetId: "preview" }).replace(/\/u\/preview\.[\w-]+/, "/u/…");
}
export { composeEmailText };
