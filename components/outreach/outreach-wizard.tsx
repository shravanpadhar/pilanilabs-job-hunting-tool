"use client";

import { Link2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DraftsStep } from "@/components/outreach/drafts-step";
import { StartPanel } from "@/components/outreach/start-panel";
import { ThreadsView } from "@/components/outreach/threads-view";
import { TargetsStep } from "@/components/outreach/targets-step";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";
import type { ExtractedJob, IntakeResult } from "@/lib/outreach/intake";
import type { TargetView } from "@/lib/outreach/view";

interface CampaignData {
  id: string;
  status: string;
  jobSnapshot: { title: string; company: string; location: string | null; requirements: string[] };
  targets: TargetView[];
}

/**
 * Outreach New: paste a link (or start from a feed job), review the extracted job, then see the people we found with
 * their source and confidence. Drafting and approval continue on the same page (added in the next step).
 */
export function OutreachWizard({ initialJobId, initialCampaignId, children }: { initialJobId?: string; initialCampaignId?: string; children?: (c: CampaignData) => React.ReactNode }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [needs, setNeeds] = useState<{ reason: string } | null>(null);
  const [paste, setPaste] = useState({ title: "", company: "", description: "" });
  const [job, setJob] = useState<ExtractedJob | null>(null);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const [approved, setApproved] = useState(0);

  const loadCampaign = useCallback(async (id: string) => {
    setCampaign(await api<CampaignData>(`/api/outreach/campaigns/${id}`));
  }, []);

  // Reopen an existing campaign.
  useEffect(() => {
    if (!initialCampaignId || started.current) return;
    started.current = true;
    loadCampaign(initialCampaignId).catch((e) => setError((e as Error).message));
  }, [initialCampaignId, loadCampaign]);

  // "Reach out" from a feed job: create the campaign straight away.
  useEffect(() => {
    if (!initialJobId || started.current) return;
    started.current = true;
    (async () => {
      setBusy(true);
      try {
        const { campaignId } = await api<{ campaignId: string }>("/api/outreach/campaigns", { method: "POST", json: { jobId: initialJobId } });
        await loadCampaign(campaignId);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, [initialJobId, loadCampaign]);

  async function read(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<IntakeResult>("/api/outreach/intake", { method: "POST", json: body });
      if (res.status === "ok") {
        setJob(res.job);
        setNeeds(null);
      } else {
        setNeeds({ reason: res.reason });
        setJob(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const { campaignId } = await api<{ campaignId: string }>("/api/outreach/campaigns", { method: "POST", json: { job } });
      await loadCampaign(campaignId);
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (campaign) {
    return (
      <div className="space-y-8">
        <Card className="space-y-1 p-5">
          <p className="text-sm text-muted-foreground">Reaching out about</p>
          <h2 className="text-2xl font-semibold" data-testid="campaign-title">{campaign.jobSnapshot.title}</h2>
          <p>{campaign.jobSnapshot.company}{campaign.jobSnapshot.location ? ` · ${campaign.jobSnapshot.location}` : ""}</p>
        </Card>
        {campaign.status === "DRAFT" ? (
          <>
            <TargetsStep campaignId={campaign.id} initial={campaign.targets} onChange={(targets) => setCampaign((c) => (c ? { ...c, targets } : c))} />
            <DraftsStep campaignId={campaign.id} ready={campaign.targets.some((t) => t.canProceed)} onApprovedCountChange={setApproved} />
            <StartPanel campaignId={campaign.id} status={campaign.status} approvedCount={approved} onStatus={(status) => setCampaign((c) => (c ? { ...c, status } : c))} />
          </>
        ) : (
          <>
            <StartPanel campaignId={campaign.id} status={campaign.status} approvedCount={approved} onStatus={(status) => setCampaign((c) => (c ? { ...c, status } : c))} />
            <ThreadsView campaignId={campaign.id} onReopen={() => loadCampaign(campaign.id)} />
          </>
        )}
        {children?.(campaign)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="warning" title="Something to fix">{error}</Notice> : null}
      {busy && initialJobId ? (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Preparing your outreach…</p>
      ) : null}

      {!initialJobId && !job ? (
        <Card className="space-y-4 p-5">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void read({ url });
            }}
          >
            <Label htmlFor="job-url">Job link</Label>
            <Input id="job-url" type="url" inputMode="url" placeholder="https://boards.greenhouse.io/company/jobs/123" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Works with Greenhouse, Lever, Ashby, Workable and most company career pages. LinkedIn and Indeed pages are never opened: paste the description instead.</p>
            <Button type="submit" loading={busy}><Link2 /> Read this job</Button>
          </form>

          {needs ? (
            <div className="space-y-3 border-t pt-4">
              <Notice tone="info" title="Paste the job instead">{needs.reason}</Notice>
              <Label htmlFor="p-title">Job title</Label>
              <Input id="p-title" value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} />
              <Label htmlFor="p-company">Company</Label>
              <Input id="p-company" value={paste.company} onChange={(e) => setPaste({ ...paste, company: e.target.value })} />
              <Label htmlFor="p-desc">Job description</Label>
              <Textarea id="p-desc" rows={8} value={paste.description} onChange={(e) => setPaste({ ...paste, description: e.target.value })} />
              <Button
                onClick={() => read({ pasted: { title: paste.title || undefined, company: paste.company || undefined, description: paste.description, sourceUrl: /^https?:\/\//.test(url) ? url : undefined } })}
                loading={busy}
                disabled={paste.description.trim().length < 40}
              >
                Use this description
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {job ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-2xl font-semibold" data-testid="extracted-title">{job.title}</h2>
          <p>{job.company}{job.location ? ` · ${job.location}` : ""}</p>
          {job.requirements.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {job.requirements.slice(0, 6).map((r) => <li key={r}>{r}</li>)}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} loading={busy}>Continue with this job</Button>
            <Button variant="ghost" onClick={() => setJob(null)}>Use a different job</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
