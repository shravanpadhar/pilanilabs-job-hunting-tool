"use client";

import { Mail, PauseCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";

interface MailboxState {
  provider: "gmail" | "fake";
  sendingEnabled: boolean;
  maxDailyCap: number;
  accounts: Array<{ id: string; accountEmail: string; status: string; dailySendCap: number; todayAllowance: number; warmupStage: number; lastError: string | null }>;
  paused: { reason: string | null; bySystem: boolean } | null;
  health: { sent: number; bounces: number; complaints: number };
}

/** Connect the candidate's own Gmail, choose a daily cap, and see warm-up and send health. Explains what will and will not be sent. */
export function MailboxCard() {
  const [state, setState] = useState<MailboxState | null>(null);
  const load = useCallback(async () => setState(await api<MailboxState>("/api/outreach/mailbox")), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load().catch(() => undefined);
  }, [load]);

  const act = async (json: unknown, ok?: string) => {
    try {
      await api("/api/outreach/mailbox", { method: "POST", json });
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!state) return null;
  const active = state.accounts.filter((a) => a.status === "ACTIVE");

  return (
    <Card className="space-y-4 p-5" data-testid="mailbox-card">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-gold-ink" aria-hidden />
        <h2 className="text-xl font-semibold">Your mailbox</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Emails are sent from your own Gmail, with your name and your tailored resume attached. We only read replies inside conversations we started for you. Nothing is sent without your approval, and
        every email ends with an opt-out line.
      </p>

      {state.paused ? (
        <Notice tone="warning" title="Sending is paused">
          {state.paused.reason ?? "Paused."}{" "}
          {state.paused.bySystem ? "We paused it automatically to protect your mailbox. Contact support to review." : (
            <Button size="sm" variant="secondary" onClick={() => act({ action: "resume_sending" }, "Sending resumed")}><PauseCircle /> Resume sending</Button>
          )}
        </Notice>
      ) : null}
      {!state.sendingEnabled ? <Notice tone="info" title="Sending is switched off on this server">Drafts and approvals work, but nothing leaves until the operator turns sending on.</Notice> : null}

      {active.length === 0 ? (
        <Button asChild>
          <a href="/api/connect/gmail/start">Connect Gmail{state.provider === "fake" ? " (demo mailbox)" : ""}</a>
        </Button>
      ) : (
        <ul className="space-y-3">
          {state.accounts.map((a) => (
            <li key={a.id} className="space-y-2 rounded-card border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{a.accountEmail}</p>
                <Badge variant={a.status === "ACTIVE" ? "success" : "warning"}>{a.status.toLowerCase()}</Badge>
              </div>
              {a.status === "ACTIVE" ? (
                <>
                  <label className="flex flex-wrap items-center gap-2 text-sm" htmlFor={`cap-${a.id}`}>
                    Daily send limit
                    <select
                      id={`cap-${a.id}`}
                      className="h-9 rounded-input border border-input-border bg-input px-2 text-input-foreground"
                      value={a.dailySendCap}
                      onChange={(e) => act({ action: "set_cap", accountId: a.id, dailySendCap: Number(e.target.value) })}
                    >
                      {[5, 10, 15, 20, 25, 30].filter((n) => n <= state.maxDailyCap).map((n) => <option key={n} value={n}>{n} emails a day</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground">Today you can send up to {a.todayAllowance}. A new mailbox warms up slowly (5 a day, rising over two weeks) so it is not flagged as spam.</p>
                  <Button size="sm" variant="ghost" onClick={() => act({ action: "disconnect", accountId: a.id }, "Mailbox disconnected")}>Disconnect</Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-danger">{a.lastError ?? "Reconnect needed."}</p>
                  <Button asChild size="sm"><a href="/api/connect/gmail/start">Reconnect</a></Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.health.sent > 0 ? <p className="text-xs text-muted-foreground">Last 7 days: {state.health.sent} first emails sent, {state.health.bounces} bounced, {state.health.complaints} complaints.</p> : null}
    </Card>
  );
}
