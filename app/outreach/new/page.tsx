import type { Metadata } from "next";
import { OutreachWizard } from "@/components/outreach/outreach-wizard";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New outreach" };
export const dynamic = "force-dynamic";

export default async function NewOutreachPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  await requireUser();
  const { jobId } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Reach out about a job</h1>
        <p className="text-muted-foreground">Paste a job link. We find the right people, you review everything, and nothing is sent without your approval.</p>
      </header>
      <OutreachWizard initialJobId={jobId} />
    </div>
  );
}
