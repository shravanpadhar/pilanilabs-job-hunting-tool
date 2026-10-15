"use client";

import { Check, Copy, ExternalLink, FileSearch, Handshake, Mail, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AtsReportView } from "@/components/ats/ats-report";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";
import { RELATIONSHIP_LABEL, type Relationship } from "@/lib/ai/referral-labels";
import type { AtsReport } from "@/lib/resume/ats";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast.error("Couldn't copy — select the text and copy it manually.");
        }
      }}
    >
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

export function AtsPanel({ jobId, hasTailored }: { jobId: string; hasTailored: boolean }) {
  const [report, setReport] = useState<AtsReport | null>(null);
  const [source, setSource] = useState<"primary" | "tailored">("primary");
  const [busy, setBusy] = useState(false);

  async function run(next: "primary" | "tailored") {
    setBusy(true);
    setSource(next);
    try {
      const res = await api<{ report: AtsReport }>(`/api/jobs/${jobId}/ats`, { method: "POST", json: { source: next } });
      setReport(res.report);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Checks how well your resume parses and how many of this job&apos;s keywords it covers. Free and instant — no AI involved.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("primary")} loading={busy && source === "primary"}>
          <FileSearch /> Check my resume
        </Button>
        {hasTailored ? (
          <Button variant="secondary" onClick={() => run("tailored")} loading={busy && source === "tailored"}>
            Check my tailored resume
          </Button>
        ) : null}
      </div>
      {report ? <AtsReportView report={report} /> : null}
    </div>
  );
}

export function CoverLetterPanel({ jobId, initial }: { jobId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);

  async function generate(regenerate: boolean) {
    setBusy(true);
    try {
      const res = await api<{ coverLetter: string }>(`/api/jobs/${jobId}/cover-letter`, { method: "POST", json: { regenerate } });
      setText(res.coverLetter);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const words = (text.match(/\S+/g) ?? []).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">A short cover letter (under 250 words) for this company and role, written only from facts in your resume. Edit it before you use it.</p>
      {!text ? (
        <Button onClick={() => generate(false)} loading={busy}>
          <Mail /> Generate cover letter
        </Button>
      ) : (
        <div className="space-y-3">
          <Textarea aria-label="Cover letter" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={text} label="Copy letter" />
            <Button variant="ghost" size="sm" onClick={() => generate(true)} loading={busy}>
              <Sparkles /> Regenerate
            </Button>
            <span className="text-xs text-muted-foreground">{words} words</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReferralLinks {
  employees: string;
  sameTeam: string;
  recruiters: string;
}

export function ReferralPanel({ jobId, company, links }: { jobId: string; company: string; links: ReferralLinks }) {
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("cold");
  const [tone, setTone] = useState<"professional" | "friendly">("professional");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ connectionNote: string; followUpMessage: string } | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setDraft(await api(`/api/jobs/${jobId}/referral`, { method: "POST", json: { contactName, contactRole, relationship, tone } }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Notice tone="info" title="You stay in control">
        We never log in to LinkedIn, scrape profiles or send messages. Find a person yourself with the search links, then paste the draft.
      </Notice>

      <div className="flex flex-wrap gap-2">
        {(
          [
            [links.employees, `People at ${company}`],
            [links.sameTeam, "Same function"],
            [links.recruiters, "Recruiters"],
          ] as const
        ).map(([href, label]) => (
          <Button key={label} asChild variant="outline" size="sm">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> {label} on LinkedIn
            </a>
          </Button>
        ))}
      </div>

      <form onSubmit={generate} className="grid gap-4 sm:grid-cols-2">
        <Field label="Their first name (optional)" htmlFor="ref-name">
          <Input id="ref-name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={80} placeholder="e.g. Priya" />
        </Field>
        <Field label="Their role (optional)" htmlFor="ref-role">
          <Input id="ref-role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} maxLength={120} placeholder="e.g. Engineering Manager" />
        </Field>
        <Field label="How do you know them?" htmlFor="ref-rel" className="sm:col-span-2">
          <Select id="ref-rel" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)}>
            {(Object.keys(RELATIONSHIP_LABEL) as Relationship[]).map((r) => (
              <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tone" htmlFor="ref-tone">
          <Select id="ref-tone" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={busy} className="w-full sm:w-auto">
            <Handshake /> Draft messages
          </Button>
        </div>
      </form>

      {draft ? (
        <div className="space-y-4">
          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">LinkedIn connection note</h4>
              <span className={draft.connectionNote.length > 300 ? "text-xs text-danger" : "text-xs text-muted-foreground"}>{draft.connectionNote.length}/300</span>
            </div>
            <Textarea aria-label="Connection note" rows={4} value={draft.connectionNote} onChange={(e) => setDraft({ ...draft, connectionNote: e.target.value })} />
            <CopyButton text={draft.connectionNote} />
          </Card>
          <Card className="space-y-2 p-4">
            <h4 className="font-semibold">Follow-up after they accept</h4>
            <Textarea aria-label="Follow-up message" rows={7} value={draft.followUpMessage} onChange={(e) => setDraft({ ...draft, followUpMessage: e.target.value })} />
            <CopyButton text={draft.followUpMessage} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
