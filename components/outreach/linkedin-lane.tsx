"use client";

import { Check, Copy, ExternalLink, Users, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MessageEditor } from "@/components/outreach/drafts-step";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { ThreadsView } from "@/lib/outreach/threads";

type Thread = ThreadsView["targets"][number];
type Event = "request_sent" | "accepted" | "message_sent" | "withdraw";

const STATE_LABEL = { NOT_STARTED: "Not started", CONNECT_PENDING: "Request sent, waiting", ACCEPTED: "Connected", MESSAGED: "Messaged", WITHDRAWN: "Withdrawn" } as const;

/**
 * LinkedIn, assisted. We never touch LinkedIn: this shows the approved note, opens the profile, and records what the
 * candidate tells us they did there. The 14-day wait and its reminders are tracked for them.
 */
export function LinkedInLane({ thread, onChanged }: { thread: Thread; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const li = thread.linkedin;
  const note = thread.messages.find((m) => m.channel === "LINKEDIN_NOTE");
  const message = thread.messages.find((m) => m.channel === "LINKEDIN_MESSAGE");
  if (!note && li.state === "NOT_STARTED") return null;

  async function act(event: Event) {
    setBusy(event);
    try {
      await api(`/api/outreach/targets/${thread.id}/linkedin`, { method: "POST", json: { action: event } });
      onChanged();
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
  const noop = () => onChanged();

  return (
    <div className="space-y-3 rounded-card border p-3" data-testid="linkedin-lane">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4" aria-hidden /> LinkedIn (you send it yourself)</p>
        <Badge variant={li.state === "ACCEPTED" || li.state === "MESSAGED" ? "success" : li.state === "WITHDRAWN" ? "muted" : "default"}>{STATE_LABEL[li.state]}</Badge>
      </div>

      {li.frozen ? <Notice tone="info" title="Paused">This person replied, opted out or could not be reached by email, so every further step to them is paused, including on LinkedIn.</Notice> : null}
      {li.shouldWithdraw ? <Notice tone="warning" title="Withdraw this request in LinkedIn">{thread.fullName} did not accept within 14 days. Withdraw the request in LinkedIn and do not message them.</Notice> : null}
      {li.state === "CONNECT_PENDING" && li.expiresAt && !li.shouldWithdraw ? <p className="text-xs text-muted-foreground">Sent {li.requestedAt ? formatDate(li.requestedAt) : ""}. If they do not accept by {formatDate(li.expiresAt)} we will remind you to withdraw it.</p> : null}

      {note && ["NOT_STARTED"].includes(li.state) && !li.frozen ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Connection note (max 300 characters). Approve it, copy it, then paste it into LinkedIn and press Send there.</p>
          <MessageEditor msg={{ ...note }} onChanged={noop} />
        </div>
      ) : null}
      {note && li.state !== "NOT_STARTED" ? <p className="whitespace-pre-wrap rounded-card bg-muted p-2 text-sm">{note.body}</p> : null}

      {li.state === "ACCEPTED" && message && !li.frozen ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">They accepted. Here is a short message to send now. Approve it first.</p>
          <MessageEditor msg={{ ...message }} onChanged={noop} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <a href={thread.linkedinProfileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open profile</a>
        </Button>
        {note && li.state === "NOT_STARTED" && note.approved ? (
          <Button size="sm" variant="secondary" onClick={() => copy("note", note.body)}>{copied === "note" ? <Check /> : <Copy />} Copy note</Button>
        ) : null}
        {message && li.state === "ACCEPTED" && message.approved ? (
          <Button size="sm" variant="secondary" onClick={() => copy("msg", message.body)}>{copied === "msg" ? <Check /> : <Copy />} Copy message</Button>
        ) : null}
        {li.canSendRequest && note?.approved ? <Button size="sm" onClick={() => act("request_sent")} loading={busy === "request_sent"}><UserCheck /> I sent the request</Button> : null}
        {li.canMarkAccepted ? <Button size="sm" onClick={() => act("accepted")} loading={busy === "accepted"}><UserCheck /> They accepted</Button> : null}
        {li.canMarkMessaged && message?.approved ? <Button size="sm" onClick={() => act("message_sent")} loading={busy === "message_sent"}>I sent the message</Button> : null}
        {li.canWithdraw ? <Button size="sm" variant="ghost" onClick={() => act("withdraw")} loading={busy === "withdraw"}><UserX /> {li.state === "NOT_STARTED" ? "Skip LinkedIn" : "I withdrew it"}</Button> : null}
      </div>
    </div>
  );
}
