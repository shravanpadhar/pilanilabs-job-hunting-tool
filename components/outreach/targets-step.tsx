"use client";

import { ShieldAlert, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api-client";
import type { TargetView } from "@/lib/outreach/view";

const ROLE_LABEL: Record<string, string> = { HIRING_MANAGER: "Hiring manager", TEAM_LEAD: "Team lead", RECRUITER: "Recruiter", WARM_PATH: "Warm path" };
const VERIFY_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  VALID: { label: "Email verified", variant: "success" },
  RISKY: { label: "Risky email", variant: "warning" },
  INVALID: { label: "Undeliverable", variant: "danger" },
  UNKNOWN: { label: "Not verified", variant: "muted" },
};
const REASON_TEXT: Record<string, string> = {
  LOW_CONFIDENCE: "Low confidence match",
  RISKY_EMAIL: "Email may bounce (risky)",
  UNVERIFIED_EMAIL: "Email could not be verified",
  UNKNOWN_COUNTRY: "Country unknown",
  NO_EMAIL: "No email found",
  SUPPRESSED: "This person opted out",
  BLOCKED_REGION: "Region we do not contact",
  INVALID_EMAIL: "Email is undeliverable",
};

/** Step 2 of the outreach flow: who we found, where the data came from, how sure we are, and the candidate's decisions. */
export function TargetsStep({ campaignId, initial, onChange }: { campaignId: string; initial: TargetView[]; onChange?: (targets: TargetView[]) => void }) {
  const [targets, setTargets] = useState<TargetView[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (next: TargetView[]) => {
    setTargets(next);
    onChange?.(next);
  };

  async function find(more = false) {
    setBusy("find");
    try {
      const res = await api<{ targets: TargetView[]; droppedSuppressed: number; droppedRegion: number }>(`/api/outreach/campaigns/${campaignId}/targets`, { method: "POST", json: more ? { limit: 3 } : {} });
      update([...targets, ...res.targets]);
      const skipped = [res.droppedRegion ? `${res.droppedRegion} in regions we do not contact` : "", res.droppedSuppressed ? `${res.droppedSuppressed} who opted out` : ""].filter(Boolean).join(" and ");
      setNotice(res.targets.length === 0 ? "No further people were found for this company." : skipped ? `Skipped ${skipped}.` : null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function accept(t: TargetView) {
    setBusy(t.id);
    try {
      const updated = await api<TargetView>(`/api/outreach/targets/${t.id}`, { method: "POST", json: { action: "acknowledge" } });
      update(targets.map((x) => (x.id === t.id ? updated : x)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: TargetView) {
    setBusy(t.id);
    try {
      await api(`/api/outreach/targets/${t.id}`, { method: "DELETE" });
      update(targets.filter((x) => x.id !== t.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="targets-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="targets-h" className="text-2xl font-semibold">People to contact</h2>
        <Button variant="secondary" onClick={() => find(targets.length > 0)} loading={busy === "find"}>
          {targets.length ? "Find more people" : "Find people"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Contacts come only from licensed data providers, never from scraping. Hiring managers come first, then team leads, recruiters and warm paths.
      </p>
      {notice ? <Notice>{notice}</Notice> : null}

      {targets.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No people yet. Press “Find people”.</Card>
      ) : (
        <ul className="grid gap-3">
          {targets.map((t) => {
            const v = VERIFY_BADGE[t.emailVerification];
            return (
              <li key={t.id}>
                <Card className="space-y-3 p-4" data-testid="target-card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t.fullName}</p>
                      <p className="text-sm text-muted-foreground">{t.title ?? "Title unknown"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="gold">{ROLE_LABEL[t.roleType]}</Badge>
                      <Badge variant={v.variant}>{v.label}</Badge>
                      <Badge variant={t.confidence >= 0.7 ? "success" : "warning"}>{Math.round(t.confidence * 100)}% confidence</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.email ?? "No email"} · Source: {t.dataProvider}
                    {t.sourceRef?.includes("school:") ? ` · Shared school: ${t.sourceRef.split("school:")[1]}` : ""}
                  </p>
                  {t.hardBlocks.length ? (
                    <Notice tone="warning" title="Cannot be contacted">{t.hardBlocks.map((r) => REASON_TEXT[r]).join(", ")}</Notice>
                  ) : t.needsDecision.length && !t.riskAcknowledgedAt ? (
                    <Notice tone="warning" title="Your decision needed">
                      {t.needsDecision.map((r) => REASON_TEXT[r]).join(", ")}. This contact is shown but will not be used unless you accept it.
                    </Notice>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-success"><UserCheck className="size-4" aria-hidden /> Ready</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!t.hardBlocks.length && t.needsDecision.length && !t.riskAcknowledgedAt ? (
                      <Button size="sm" variant="secondary" onClick={() => accept(t)} loading={busy === t.id}>
                        <ShieldAlert /> Use anyway
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => remove(t)} loading={busy === t.id}>
                      <UserX /> Remove
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
