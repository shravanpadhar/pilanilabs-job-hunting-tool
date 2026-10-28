"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

/** One small form per admin action; every submit goes through /api/admin/action (allow-listed and audit-logged). */
function ActionForm({ title, hint, fields, build, done }: { title: string; hint?: string; fields: Array<{ name: string; label: string; type?: string; placeholder?: string }>; build: (v: Record<string, string>) => unknown; done?: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/action", { method: "POST", json: build(v) });
      toast.success(done ?? "Done");
      setV({});
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-card border p-3">
      <p className="font-semibold">{title}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <Label htmlFor={`${title}-${f.name}`}>{f.label}</Label>
          <Input id={`${title}-${f.name}`} type={f.type ?? "text"} placeholder={f.placeholder} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} required />
        </div>
      ))}
      <Button type="submit" size="sm" loading={busy}>{title}</Button>
    </form>
  );
}

export function AdminActions() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ActionForm title="Pause a candidate" fields={[{ name: "email", label: "Candidate email" }, { name: "reason", label: "Reason" }]} build={(v) => ({ action: "pause_user", email: v.email, reason: v.reason })} done="Sending paused" />
      <ActionForm title="Resume a candidate" hint="Lifts any pause, including an automatic one." fields={[{ name: "email", label: "Candidate email" }]} build={(v) => ({ action: "resume_user", email: v.email })} done="Sending resumed" />
      <ActionForm title="Grant credits" fields={[{ name: "email", label: "Candidate email" }, { name: "credits", label: "Credits", type: "number" }, { name: "note", label: "Note" }]} build={(v) => ({ action: "grant_credits", email: v.email, credits: Number(v.credits), note: v.note })} done="Credits granted" />
      <ActionForm title="Set cost ceiling" hint="Micro-dollars over 30 days (1,000,000 = $1). Leave a very high number to lift it." fields={[{ name: "email", label: "Candidate email" }, { name: "micros", label: "Ceiling (micro-dollars)", type: "number" }]} build={(v) => ({ action: "set_ceiling", email: v.email, costCeilingMicros: Number(v.micros) })} done="Ceiling updated" />
      <ActionForm title="Suppress an address" hint="Adds it to the global do-not-contact list." fields={[{ name: "target", label: "Email address" }]} build={(v) => ({ action: "suppress_email", target: v.target, reason: "MANUAL" })} done="Address suppressed" />
      <ActionForm title="Suppress a domain" hint="For example a company that asked us to stop." fields={[{ name: "domain", label: "Domain", placeholder: "example.com" }]} build={(v) => ({ action: "suppress_domain", domain: v.domain })} done="Domain suppressed" />
    </div>
  );
}
