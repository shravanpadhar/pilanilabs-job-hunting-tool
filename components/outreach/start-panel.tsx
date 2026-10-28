"use client";

import { Pause, Play, Rocket, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";

/** Final step: start sending the approved emails, and pause / resume / cancel afterwards. */
export function StartPanel({ campaignId, status, approvedCount, onStatus }: { campaignId: string; status: string; approvedCount: number; onStatus: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [needsMailbox, setNeedsMailbox] = useState(false);

  async function run(action: "start" | "pause" | "resume" | "cancel") {
    setBusy(true);
    try {
      const res = await api<{ scheduled?: number; targets?: number }>(`/api/outreach/campaigns/${campaignId}/status`, { method: "POST", json: { action } });
      const next = { start: "ACTIVE", resume: "ACTIVE", pause: "PAUSED", cancel: "CANCELLED" }[action];
      onStatus(next);
      toast.success(action === "start" ? `Scheduled ${res.scheduled} emails to ${res.targets} people. The job is now “Outreach active” in your tracker.` : action === "cancel" ? "Outreach cancelled" : action === "pause" ? "Paused. Nothing will be sent until you resume." : "Resumed");
    } catch (e) {
      const m = (e as Error).message;
      setNeedsMailbox(/Connect your Gmail/i.test(m));
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  if (status === "CANCELLED" || status === "COMPLETED") return <Notice tone="info" title={status === "CANCELLED" ? "This outreach was cancelled" : "This outreach is complete"} />;

  return (
    <Card className="space-y-3 p-5" data-testid="start-panel">
      <h2 className="text-xl font-semibold">{status === "DRAFT" ? "Start sending" : "Outreach " + status.toLowerCase()}</h2>
      {status === "DRAFT" ? (
        <>
          <p className="text-sm text-muted-foreground">
            {approvedCount > 0 ? `${approvedCount} ${approvedCount === 1 ? "person has" : "people have"} an approved first email.` : "Approve at least one first email to start."} Follow-ups go out on day 3 and day 7 only if nobody replies, and
            only the messages you approved are sent.
          </p>
          <Button onClick={() => run("start")} loading={busy} disabled={approvedCount === 0}><Rocket /> Start outreach</Button>
          {needsMailbox ? <Notice tone="warning" title="Connect your Gmail first">Use the “Your mailbox” card on the Outreach page, then come back.</Notice> : null}
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "ACTIVE" ? <Button variant="secondary" onClick={() => run("pause")} loading={busy}><Pause /> Pause</Button> : null}
          {status === "PAUSED" ? <Button onClick={() => run("resume")} loading={busy}><Play /> Resume</Button> : null}
          <Button variant="ghost" onClick={() => run("cancel")} loading={busy}><XCircle /> Cancel remaining messages</Button>
        </div>
      )}
    </Card>
  );
}
