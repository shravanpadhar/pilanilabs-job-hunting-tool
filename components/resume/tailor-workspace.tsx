"use client";

import { AlertTriangle, Download, FileText, Loader2, RefreshCw, Save, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { JobActions } from "@/components/jobs/job-actions";
import { AtsPanel, CoverLetterPanel } from "@/components/jobs/job-panels";
import { ResumeEditor } from "@/components/resume/resume-editor";
import { ResumePreview } from "@/components/resume/resume-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { diffResumes } from "@/lib/resume/diff";
import type { ResumeData } from "@/lib/resume/schema";

interface Change {
  section: string;
  change: string;
  reason?: string;
}

export interface TailorInitial {
  id: string;
  tailored: ResumeData;
  changes: Change[];
  skillGaps: string[];
}

export function TailorWorkspace({
  job,
  original,
  initial,
  coverLetter,
  applicationStatus,
  sourceName,
  aiEnabled,
}: {
  job: { id: string; title: string; company: string; applyUrl: string };
  original: ResumeData;
  initial: TailorInitial | null;
  coverLetter: string | null;
  applicationStatus: string | null;
  sourceName: string;
  aiEnabled: boolean;
}) {
  const [data, setData] = useState<TailorInitial | null>(initial);
  const [edited, setEdited] = useState<ResumeData | null>(initial?.tailored ?? null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shortDesc, setShortDesc] = useState(false);

  const diff = useMemo(() => (edited ? diffResumes(original, edited) : null), [original, edited]);

  async function generate(regenerate: boolean) {
    if (regenerate && dirty && !confirm("Regenerating replaces your manual edits. Continue?")) return;
    setBusy(true);
    try {
      const res = await api<{ id: string; tailored: ResumeData; changes: Change[]; skillGaps: string[]; shortDescription: boolean; cached: boolean; repaired?: boolean }>(
        `/api/jobs/${job.id}/tailor`,
        { method: "POST", json: { regenerate } },
      );
      setData({ id: res.id, tailored: res.tailored, changes: res.changes, skillGaps: res.skillGaps });
      setEdited(res.tailored);
      setVersion((v) => v + 1);
      setDirty(false);
      setShortDesc(res.shortDescription);
      if (res.repaired) toast.info("We removed a few details that weren't in your original resume.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!edited) return false;
    setSaving(true);
    try {
      await api(`/api/jobs/${job.id}/tailor`, { method: "PUT", json: { contentJson: edited } });
      setDirty(false);
      toast.success("Changes saved");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function download(format: "pdf" | "docx") {
    if (!data) return;
    if (dirty && !(await save())) return;
    const a = document.createElement("a");
    a.href = `/api/tailored/${data.id}/export?format=${format}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!data || !edited || !diff) {
    return (
      <Card className="mx-auto max-w-2xl space-y-5 p-6 text-center sm:p-10">
        <Wand2 className="mx-auto size-10 text-gold-ink" aria-hidden />
        <h2 className="text-3xl font-semibold">Tailor your resume for this job</h2>
        <p className="text-muted-foreground">
          Claude rewrites your summary, reorders skills and bullets, and mirrors the job&apos;s keywords <strong>only where your real experience supports them</strong>. It never invents employers, titles, dates, degrees, metrics or skills.
        </p>
        {!aiEnabled ? (
          <Notice tone="warning" title="AI isn't configured">
            Add an AI key (ANTHROPIC_API_KEY, or OPENROUTER_API_KEY with AI_PROVIDER=openrouter) to enable tailoring.
          </Notice>
        ) : null}
        <Button size="lg" onClick={() => generate(false)} loading={busy} disabled={!aiEnabled}>
          {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} {busy ? "Tailoring… this takes ~20 seconds" : "Generate tailored resume"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {shortDesc ? (
        <Notice tone="warning" title="Short job description">
          This source only shared a summary, so tailoring may be less specific. Open the original posting for the full requirements.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => download("pdf")} loading={saving}>
            <Download /> Download PDF
          </Button>
          <Button variant="secondary" onClick={() => download("docx")} loading={saving}>
            <FileText /> Download DOCX
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge variant="warning">Unsaved edits</Badge> : <Badge variant="success">Saved</Badge>}
          <Button variant="outline" size="sm" onClick={save} disabled={!dirty} loading={saving}>
            <Save /> Save edits
          </Button>
          <Button variant="ghost" size="sm" onClick={() => generate(true)} loading={busy}>
            <RefreshCw /> Regenerate
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Tabs defaultValue="compare" className="min-w-0">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList aria-label="Tailored resume views">
              <TabsTrigger value="compare">Compare</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="changes">What changed ({data.changes.length})</TabsTrigger>
              <TabsTrigger value="ats">ATS check</TabsTrigger>
              <TabsTrigger value="cover">Cover letter</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="compare">
            <div className="grid gap-4 xl:grid-cols-2">
              <section aria-labelledby="orig-h" className="min-w-0">
                <h2 id="orig-h" className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-muted-foreground">Original</h2>
                <ResumePreview data={original} />
              </section>
              <section aria-labelledby="tail-h" className="min-w-0">
                <h2 id="tail-h" className="mb-2 flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wide text-gold-ink">
                  Tailored <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.7rem] normal-case tracking-normal">highlighted = reworded</span>
                </h2>
                <ResumePreview data={edited} diff={diff} />
              </section>
            </div>
          </TabsContent>

          <TabsContent value="edit">
            <Notice tone="info" title="Edit anything">
              Your edits are used for the PDF and DOCX. Only add things that are true — recruiters will ask about them.
            </Notice>
            <div className="mt-4">
              <ResumeEditor
                value={edited}
                version={version}
                idPrefix="tr"
                onChange={(next) => {
                  setEdited(next);
                  setDirty(true);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="changes" className="space-y-4">
            {data.changes.length === 0 ? <p className="text-muted-foreground">No changes were needed — your resume already fits this job well.</p> : null}
            <ul className="space-y-2">
              {data.changes.map((c, i) => (
                <li key={i}>
                  <Card className="p-4">
                    <Badge variant="gold">{c.section}</Badge>
                    <p className="mt-2 font-semibold">{c.change}</p>
                    {c.reason ? <p className="text-sm text-muted-foreground">{c.reason}</p> : null}
                  </Card>
                </li>
              ))}
            </ul>
            {diff.removedBullets.length ? (
              <details className="rounded-card border p-4">
                <summary className="cursor-pointer font-semibold">{diff.removedBullets.length} original bullet(s) left out to keep it focused</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {diff.removedBullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </TabsContent>

          <TabsContent value="ats">
            <AtsPanel jobId={job.id} hasTailored />
          </TabsContent>
          <TabsContent value="cover">
            <CoverLetterPanel jobId={job.id} initial={coverLetter} />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
              <AlertTriangle className="size-5 text-warning" aria-hidden /> Skill gaps
            </h2>
            {data.skillGaps.length ? (
              <>
                <p className="text-sm text-muted-foreground">The job asks for these and your resume doesn&apos;t show them. We did not add them. Address them honestly — for example, by learning them or mentioning real experience you left out.</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {data.skillGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No major gaps found.</p>
            )}
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-heading text-xl font-semibold">Ready to apply?</h2>
            <p className="text-sm text-muted-foreground">Download your resume, then apply on the original site.</p>
            <JobActions jobId={job.id} applyUrl={job.applyUrl} sourceName={sourceName} status={applicationStatus} tailoredResumeId={data.id} hasResume hideTailor />
          </Card>
          <Button asChild variant="link" className="px-0">
            <Link href={`/jobs/${job.id}`}>← Back to {job.title}</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
