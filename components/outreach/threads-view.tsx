"use client";

import { Check, Copy, ExternalLink, Mail, RefreshCw, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageEditor } from "@/components/outreach/drafts-step";
import { LinkedInLane } from "@/components/outreach/linkedin-lane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { ThreadsView as Threads } from "@/lib/outreach/threads";

type Thread = Threads["targets"][number];

const STATE_LABEL: Record<string, { label: string; variant: "success" | "warning" | "danger" | "muted" | "default" }> = {
  SCHEDULED: { label: "Scheduled", variant: "default" }, SENT: { label: "Waiting for a reply", variant: "default" }, REPLIED: { label: "Replied", variant: "success" },
  BOUNCED: { label: "Bounced", variant: "danger" }, OPTED_OUT: { label: "Opted out", variant: "warning" }, COMPLETED: { label: "No reply", variant: "muted" },
  APPROVED: { label: "Approved", variant: "default" }, DRAFTED: { label: "Draft", variant: "muted" }, VERIFIED: { label: "Ready", variant: "muted" }, DISCOVERED: { label: "Found", variant: "muted" },
};
const REPLY_LABEL: Record<string, string> = { INTERESTED: "Interested", REFERRAL: "Offered a referral", NOT_NOW: "Not right now", NO: "Declined", OUT_OF_OFFICE: "Out of office", UNSUBSCRIBE: "Asked us to stop", OTHER: "Replied" };
const MSG_STATE: Record<string, string> = { DRAFT: "Draft", APPROVED: "Approved", SCHEDULED: "Scheduled", SENDING: "Sending", SENT: "Sent", FAILED: "Failed", CANCELLED: "Cancelled" };

/** The Outreach Inbox for one job: a thread per person with status, next step, replies and a suggested response (never auto-sent). */
export function ThreadsView({ campaignId, onReopen }: { campaignId: string; onReopen?: () => void }) {
  const [data, setData] = useState<Threads | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setData(await api<Threads>(`/api/outreach/campaigns/${campaignId}/threads`)), [campaignId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load().catch(() => undefined);
  }, [load]);

  async function cancel(messageId: string) {
    setBusy(messageId);
    try {
      await api(`/api/outreach/messages/${messageId}`, { method: "DELETE" });
      toast.success("Step cancelled");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function interview(replyId: string) {
    setBusy(replyId);
    try {
      await api(`/api/outreach/replies/${replyId}`, { method: "POST", json: { action: "confirm_interview" } });
      toast.success("Moved to Interviewing in your tracker");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function nextPeople() {
    setBusy("next");
    try {
      await api(`/api/outreach/campaigns/${campaignId}/status`, { method: "POST", json: { action: "next_targets" } });
      onReopen?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading your threads…</p>;
  const anyReply = data.targets.some((t) => t.replies.length > 0);

  return (
    <section aria-labelledby="threads-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="threads-h" className="text-2xl font-semibold">Conversations</h2>
        <Button size="sm" variant="ghost" onClick={() => load()}><RefreshCw /> Refresh</Button>
      </div>

      {data.status === "COMPLETED" && !anyReply ? (
        <Notice tone="info" title="No replies this time">
          Nobody answered the sequence. That is common, and it does not mean the role is closed. Try different people, or a job where your skills line up even more closely.
          <div className="mt-3"><Button size="sm" onClick={nextPeople} loading={busy === "next"}>Find the next three people</Button></div>
        </Notice>
      ) : null}
      {data.status === "COMPLETED" && anyReply ? <div><Button size="sm" variant="secondary" onClick={nextPeople} loading={busy === "next"}>Reach out to more people at this company</Button></div> : null}

      {data.targets.map((t: Thread) => {
        const st = STATE_LABEL[t.state] ?? { label: t.state.toLowerCase(), variant: "muted" as const };
        return (
          <Card key={t.id} className="space-y-3 p-4" data-testid="thread-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{t.fullName}</p>
                <p className="text-sm text-muted-foreground">{t.title} · {t.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={st.variant}>{st.label}</Badge>
                {t.nextStep ? <Badge variant="muted">Next: email {t.nextStep.step} on {formatDate(t.nextStep.at)}</Badge> : null}
              </div>
            </div>

            {t.replies.map((r) => (
              <div key={r.id} className="space-y-2 rounded-card border border-success/40 bg-success/5 p-3" data-testid="reply-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={["INTERESTED", "REFERRAL"].includes(r.classification) ? "success" : r.classification === "UNSUBSCRIBE" ? "warning" : "muted"}>{REPLY_LABEL[r.classification]}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(r.receivedAt)}</span>
                </div>
                <p className="text-sm">&ldquo;{r.snippet}&rdquo;</p>
                {r.suggestedResponse ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested reply (you send it yourself)</p>
                    <pre className="whitespace-pre-wrap rounded-card bg-muted p-3 text-sm">{r.suggestedResponse}</pre>
                    <Button size="sm" variant="secondary" onClick={() => copy(r.id, r.suggestedResponse!)}>{copied === r.id ? <Check /> : <Copy />} {copied === r.id ? "Copied" : "Copy reply"}</Button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {t.gmailUrl ? <Button asChild size="sm" variant="secondary"><a href={t.gmailUrl} target="_blank" rel="noopener noreferrer"><Mail /> Open in Gmail <ExternalLink /></a></Button> : null}
                  {["INTERESTED", "REFERRAL"].includes(r.classification) && data.applicationStatus !== "INTERVIEWING" ? (
                    <Button size="sm" onClick={() => interview(r.id)} loading={busy === r.id}><Trophy /> I have an interview</Button>
                  ) : null}
                </div>
              </div>
            ))}

            <LinkedInLane thread={t} onChanged={() => load()} />

            <details open={!t.replies.length}>
              <summary className="cursor-pointer text-sm font-semibold">Emails ({t.messages.filter((m) => m.channel === "EMAIL").length})</summary>
              <div className="mt-2 space-y-2">
                {t.messages.filter((m) => m.channel === "EMAIL").map((m) => {
                  const unsent = ["DRAFT", "APPROVED", "SCHEDULED", "FAILED"].includes(m.state);
                  return unsent && ["ACTIVE", "PAUSED", "DRAFT"].includes(data.status) ? (
                    <div key={m.id} className="space-y-1">
                      <MessageEditor msg={{ ...m, channel: m.channel, subject: m.subject, scheduledAt: m.scheduledAt, sentAt: m.sentAt, templateKey: m.templateKey }} onChanged={() => load()} />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{m.scheduledAt ? `Planned ${formatDate(m.scheduledAt)}` : "Not scheduled"}{m.lastError ? ` · ${m.lastError}` : ""}</span>
                        <Button size="sm" variant="ghost" onClick={() => cancel(m.id)} loading={busy === m.id}>Cancel this step</Button>
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="rounded-card border p-3 text-sm">
                      <p className="font-semibold">{m.channel === "EMAIL" ? `Email ${m.step}` : m.channel === "LINKEDIN_NOTE" ? "LinkedIn note" : "LinkedIn message"} · {MSG_STATE[m.state]}{m.sentAt ? ` ${formatDate(m.sentAt)}` : ""}</p>
                      {m.subject ? <p className="text-muted-foreground">{m.subject}</p> : null}
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{m.body}</p>
                    </div>
                  );
                })}
              </div>
            </details>
          </Card>
        );
      })}
    </section>
  );
}
