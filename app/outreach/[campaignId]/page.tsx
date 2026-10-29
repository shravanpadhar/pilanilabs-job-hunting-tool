import type { Metadata } from "next";
import { OutreachWizard } from "@/components/outreach/outreach-wizard";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  await requireUser();
  const { campaignId } = await params;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold sm:text-4xl">Outreach</h1>
      <OutreachWizard initialCampaignId={campaignId} />
    </div>
  );
}
