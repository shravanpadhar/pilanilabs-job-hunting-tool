import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { footerPreview } from "@/lib/outreach/preview";
import { getOutreachProfile, isProfileComplete } from "@/lib/outreach/profile";
import { wordCount } from "@/lib/outreach/verify-message";

/** Everything the drafts screen needs for a campaign, in one client-safe object. */
export async function loadDraftsView(userId: string, campaignId: string) {
  const campaign = await db.outreachCampaign.findFirst({
    where: { id: campaignId, userId },
    include: { targets: { where: { state: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" }, include: { messages: { orderBy: [{ channel: "asc" }, { step: "asc" }] } } } },
  });
  if (!campaign) throw notFound("Campaign");
  const profile = await getOutreachProfile(userId);
  return {
    campaignStatus: campaign.status,
    profile: {
      complete: isProfileComplete(profile),
      senderName: profile?.senderName ?? "",
      postalAddress: profile?.postalAddress ?? "",
      timeZone: profile?.timeZone ?? "Asia/Kolkata",
      notifyEmail: profile?.notifyEmail ?? true,
      notifyWhatsapp: profile?.notifyWhatsapp ?? false,
      whatsappNumber: profile?.whatsappNumber ?? "",
    },
    footer: await footerPreview(userId),
    targets: campaign.targets
      .filter((t) => t.messages.length > 0)
      .map((t) => ({
        id: t.id,
        fullName: t.fullName,
        title: t.title,
        email: t.email,
        state: t.state,
        messages: t.messages.map((m) => ({
          id: m.id, channel: m.channel, step: m.step, subject: m.subject, body: m.body, state: m.state, templateKey: m.templateKey,
          words: wordCount(m.body), approved: m.approvedTextHash !== null && ["APPROVED", "SCHEDULED", "SENDING", "SENT"].includes(m.state),
          scheduledAt: m.scheduledAt?.toISOString() ?? null, sentAt: m.sentAt?.toISOString() ?? null,
        })),
      })),
  };
}
export type DraftsView = Awaited<ReturnType<typeof loadDraftsView>>;
