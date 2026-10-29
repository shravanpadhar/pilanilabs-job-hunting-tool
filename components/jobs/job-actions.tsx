"use client";

import { Bookmark, BookmarkCheck, ExternalLink, FileText, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

const STATUS_LABEL: Record<string, string> = { SAVED: "Saved", APPLIED: "Applied", INTERVIEWING: "Interviewing", OFFER: "Offer", REJECTED: "Rejected" };

export function JobActions({
  jobId,
  applyUrl,
  sourceName,
  status,
  tailoredResumeId,
  hasResume,
  hideTailor = false,
}: {
  jobId: string;
  applyUrl: string;
  sourceName: string;
  status: string | null;
  tailoredResumeId: string | null;
  hasResume: boolean;
  hideTailor?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);

  async function setStatus(next: "SAVED" | "APPLIED") {
    setBusy(true);
    try {
      await api("/api/applications", { method: "POST", json: { jobId, status: next, tailoredResumeId } });
      setCurrent((c) => (next === "APPLIED" || !c ? next : c));
      toast.success(next === "APPLIED" ? "Marked as applied — good luck!" : "Saved to your tracker");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setAsk(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {current ? (
        <p className="text-sm">
          Tracker status: <Badge variant="gold">{STATUS_LABEL[current]}</Badge>{" "}
          <Link href="/tracker" className="underline">
            Open tracker
          </Link>
        </p>
      ) : null}

      <Button asChild size="lg">
        <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => !current || current === "SAVED" ? setAsk(true) : null, 600)}>
          Apply on {sourceName} <ExternalLink />
        </a>
      </Button>

      {hideTailor ? null : hasResume ? (
        <Button asChild variant="secondary" size="lg">
          <Link href={`/jobs/${jobId}/tailor`}>
            <FileText /> Tailor my resume
          </Link>
        </Button>
      ) : (
        <Button asChild variant="secondary" size="lg">
          <Link href="/onboarding">Upload a resume to tailor</Link>
        </Button>
      )}

      {hasResume ? (
        <Button asChild variant="secondary" size="lg">
          <Link href={`/outreach/new?jobId=${jobId}`}>
            <Send /> Reach out
          </Link>
        </Button>
      ) : null}

      <Button variant="ghost" onClick={() => setStatus("SAVED")} loading={busy} disabled={Boolean(current)}>
        {current ? <BookmarkCheck /> : <Bookmark />} {current ? "In your tracker" : "Save for later"}
      </Button>

      <Dialog open={ask} onOpenChange={setAsk}>
        <DialogContent>
          <DialogTitle>Did you apply?</DialogTitle>
          <DialogDescription>We opened the original posting in a new tab. If you submitted your application, add it to your tracker as Applied.</DialogDescription>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setStatus("APPLIED")} loading={busy}>
              Yes, mark as Applied
            </Button>
            <Button variant="ghost" onClick={() => setAsk(false)}>
              Not yet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
