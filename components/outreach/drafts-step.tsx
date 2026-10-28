"use client";

import { CalendarClock, CheckCircle2, PenLine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";
import type { DraftsView } from "@/lib/outreach/drafts-view";

type Msg = DraftsView["targets"][number]["messages"][number];
interface SchedulePreview {
  candidateTz: string;
  targets: Array<{ targetId: string; fullName: string; recipientTz: string; recipientTzAssumed: boolean; steps: Array<{ step: number; candidateLocal: string; recipientLocal: string }> }>;
}

const STATE_VARIANT = { DRAFT: "muted", APPROVED: "success", SCHEDULED: "success", SENDING: "warning", SENT: "default", FAILED: "danger", CANCELLED: "muted" } as const;
const CHANNEL_LABEL = { EMAIL: "Email", LINKEDIN_NOTE: "LinkedIn connection note", LINKEDIN_MESSAGE: "LinkedIn message" } as const;

function MessageEditor({ msg, onChanged }: { msg: Msg; onChanged: (m: Partial<Msg> & { id: string }) => void }) {
  const [subject, setSubject] = useState(msg.subject ?? "");
  const [body, setBody] = useState(msg.body);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const dirty = subject !== (msg.subject ?? "") || body !== msg.body;
  const isEmail = msg.channel === "EMAIL";
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const over = isEmail ? words >= 120 : body.length > 300;
  const locked = ["SENT", "SENDING"].includes(msg.state);

  async function post(action: "save" | "approve") {
    setBusy(action);
    try {
      const res = await api<{ state: Msg["state"]; approved: boolean; subject: string | null; body: string }>(`/api/outreach/messages/${msg.id}`, {
        method: "POST",
        json: action === "approve" ? { action: "approve" } : { action: "edit", subject: isEmail ? subject : null, body },
      });
      onChanged({ id: msg.id, state: res.state, approved: res.approved, subject: res.subject, body: res.body });
      if (action === "approve") toast.success("Approved. It will only go out exactly as shown.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-card border p-3" data-testid="message-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {CHANNEL_LABEL[msg.channel]}
          {isEmail ? ` · step ${msg.step} (day ${[0, 3, 7][msg.step - 1]})` : ""}
        </p>
        <Badge variant={STATE_VARIANT[msg.state]}>{msg.approved ? "Approved" : msg.state.toLowerCase()}</Badge>
      </div>
      {isEmail ? (
        <>
          <Label htmlFor={`s-${msg.id}`} className="sr-only">Subject</Label>
          <Input id={`s-${msg.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} aria-label="Subject" />
        </>
      ) : null}
      <Label htmlFor={`b-${msg.id}`} className="sr-only">Message</Label>
      <Textarea id={`b-${msg.id}`} rows={isEmail ? 8 : 4} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} aria-label="Message" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${over ? "text-danger" : "text-muted-foreground"}`}>{isEmail ? `${words} words (under 120)` : `${body.length} / 300 characters`}</p>
        <div className="flex gap-2">
          {dirty ? (
            <Button size="sm" variant="secondary" onClick={() => post("save")} loading={busy === "save"} disabled={locked || over}>
              <PenLine /> Save changes
            </Button>
          ) : null}
          {!msg.approved && !locked ? (
            <Button size="sm" onClick={() => post("approve")} loading={busy === "approve"} disabled={dirty || over}>
              <CheckCircle2 /> Approve
            </Button>
          ) : null}
        </div>
      </div>
      {dirty ? <p className="text-xs text-muted-foreground">Save your changes, then approve. Any edit removes an earlier approval.</p> : null}
    </div>
  );
}

function SenderForm({ initial, onSaved }: { initial: DraftsView["profile"]; onSaved: () => void }) {
  const [v, setV] = useState({ senderName: initial.senderName, postalAddress: initial.postalAddress, timeZone: initial.timeZone });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/outreach/profile", { method: "PUT", json: { ...v, notifyEmail: initial.notifyEmail, notifyWhatsapp: initial.notifyWhatsapp, whatsappNumber: initial.whatsappNumber || null } });
      toast.success("Sender details saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-xl font-semibold">Your sender details</h3>
      <p className="text-sm text-muted-foreground">Every email shows your real name and a postal address, plus a working opt-out line. This is required by anti-spam law. A PO box or mail-forwarding address is fine.</p>
      <Label htmlFor="sender-name">Name recipients will see</Label>
      <Input id="sender-name" value={v.senderName} onChange={(e) => setV({ ...v, senderName: e.target.value })} />
      <Label htmlFor="sender-address">Postal address</Label>
      <Textarea id="sender-address" rows={3} value={v.postalAddress} onChange={(e) => setV({ ...v, postalAddress: e.target.value })} />
      <Label htmlFor="sender-tz">Your time zone</Label>
      <Input id="sender-tz" list="tz-list" value={v.timeZone} onChange={(e) => setV({ ...v, timeZone: e.target.value })} />
      <datalist id="tz-list">
        {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"].map((z) => <option key={z} value={z} />)}
      </datalist>
      <Button onClick={save} loading={busy}>Save sender details</Button>
    </Card>
  );
}

/** Step 3 of Outreach New: drafts, inline edit, approval, and the schedule in both time zones. */
export function DraftsStep({ campaignId, ready, onApprovedCountChange }: { campaignId: string; ready: boolean; onApprovedCountChange?: (n: number) => void }) {
  const [view, setView] = useState<DraftsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<SchedulePreview | null>(null);

  const refresh = useCallback(async () => {
    setView(await api<DraftsView>(`/api/outreach/campaigns/${campaignId}/drafts`));
  }, [campaignId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the drafts once when the step mounts
    refresh().catch(() => undefined);
  }, [refresh]);

  const approvedCount = view?.targets.reduce((n, t) => n + t.messages.filter((m) => m.approved && m.channel === "EMAIL" && m.step === 1).length, 0) ?? 0;
  useEffect(() => onApprovedCountChange?.(approvedCount), [approvedCount, onApprovedCountChange]);

  async function generate() {
    setBusy(true);
    try {
      const res = await api<{ view: DraftsView; fallbacks: number }>(`/api/outreach/campaigns/${campaignId}/drafts`, { method: "POST" });
      setView(res.view);
      if (res.fallbacks) toast.message("Some drafts use our safe template because the AI draft did not pass the fact check.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSchedule() {
    try {
      setSchedule(await api<SchedulePreview>(`/api/outreach/campaigns/${campaignId}/schedule`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const patch = (u: Partial<Msg> & { id: string }) =>
    setView((v) => (v ? { ...v, targets: v.targets.map((t) => ({ ...t, messages: t.messages.map((m) => (m.id === u.id ? { ...m, ...u, words: (u.body ?? m.body).trim().split(/\s+/).filter(Boolean).length } : m)) })) } : v));

  return (
    <section aria-labelledby="drafts-h" className="space-y-4">
      <h2 id="drafts-h" className="text-2xl font-semibold">Review and approve your messages</h2>
      {view && !view.profile.complete ? <SenderForm initial={view.profile} onSaved={refresh} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={generate} loading={busy} disabled={!ready || !view?.profile.complete}>
          {view?.targets.length ? "Write drafts again" : "Write drafts"}
        </Button>
        {!ready ? <p className="text-sm text-muted-foreground">Find people first (and accept or remove any weak contacts).</p> : null}
      </div>

      {view?.targets.length ? (
        <>
          <Notice tone="info" title="Nothing is sent without your approval">
            Drafts are written only from facts in your resume and the job. If you change a message after approving it, you approve it again. You can pause or cancel any step later.
          </Notice>
          {view.targets.map((t) => (
            <Card key={t.id} className="space-y-3 p-4" data-testid="draft-target">
              <div>
                <p className="font-semibold">{t.fullName}</p>
                <p className="text-sm text-muted-foreground">{t.title} · {t.email ?? "no email"}</p>
              </div>
              {t.messages.map((m) => <MessageEditor key={m.id} msg={m} onChanged={patch} />)}
            </Card>
          ))}
          {view.footer ? (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-semibold">What every email ends with</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-card bg-muted p-3 text-xs">{view.footer}</pre>
            </details>
          ) : null}

          <div className="space-y-3">
            <Button variant="secondary" onClick={loadSchedule}>
              <CalendarClock /> Preview schedule
            </Button>
            {schedule ? (
              <Card className="overflow-x-auto p-4" data-testid="schedule-preview">
                <table className="w-full text-left text-sm">
                  <caption className="mb-2 text-left text-sm text-muted-foreground">Planned send times (your zone: {schedule.candidateTz}). Emails go out only inside the recipient&apos;s working hours, Monday to Friday.</caption>
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Person</th><th className="pr-3">Step</th><th className="pr-3">Your time</th><th>Their time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.targets.flatMap((t) =>
                      t.steps.map((s) => (
                        <tr key={`${t.targetId}-${s.step}`} className="border-b last:border-0">
                          <td className="py-2 pr-3">{t.fullName}</td>
                          <td className="pr-3">Day {[0, 3, 7][s.step - 1]}</td>
                          <td className="pr-3">{s.candidateLocal}</td>
                          <td>{s.recipientLocal} <span className="text-xs text-muted-foreground">({t.recipientTz}{t.recipientTzAssumed ? ", assumed" : ""})</span></td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
