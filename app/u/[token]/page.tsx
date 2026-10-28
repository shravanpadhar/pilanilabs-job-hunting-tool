import type { Metadata } from "next";
import { OptOutForm } from "@/components/outreach/optout-form";
import { Card } from "@/components/ui/card";
import { optOutPreview } from "@/lib/outreach/optout-action";

export const metadata: Metadata = { title: "Stop receiving emails", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Public page (no sign-in): confirms before opting out, so a mail scanner opening the link changes nothing. */
export default async function OptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await optOutPreview(token);
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Card className="space-y-4 p-6">
        {p.valid ? (
          <>
            <h1 className="text-2xl font-semibold">Stop receiving emails?</h1>
            <p className="text-muted-foreground">
              {p.senderName ? `${p.senderName} wrote to you about a job.` : "Someone wrote to you about a job."} Confirm below and you will not be contacted again through this service.
            </p>
            <OptOutForm token={token} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">This link is not valid</h1>
            <p className="text-muted-foreground">It may have been copied incorrectly. You can also just reply &quot;unsubscribe&quot; to the email and we will stop.</p>
          </>
        )}
      </Card>
    </div>
  );
}
