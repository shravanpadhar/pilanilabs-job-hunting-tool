"use client";

import { Download, FileText, Star, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { PreferencesInput } from "@/lib/validation";

export function PreferencesSettings({ initial, suggestedRoles }: { initial: PreferencesInput; suggestedRoles: string[] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/api/preferences", { method: "PUT", json: prefs });
      const s = await api<{ kept: number }>("/api/matches/refresh", { method: "POST" });
      toast.success(`Preferences saved — ${s.kept} matches updated`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job preferences</CardTitle>
        <CardDescription>Saving re-ranks your feed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PreferencesForm value={prefs} onChange={setPrefs} suggestedRoles={suggestedRoles} />
        <Button onClick={save} loading={busy}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}

export interface ResumeRow {
  id: string;
  fileName: string;
  isPrimary: boolean;
  createdAt: string;
  hasFile: boolean;
}

export function ResumeManager({ resumes }: { resumes: ResumeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function makePrimary(id: string) {
    setBusy(id);
    try {
      await api(`/api/resume/${id}`, { method: "PATCH", json: { isPrimary: true } });
      await api("/api/matches/refresh", { method: "POST" }).catch(() => null);
      toast.success("Primary resume updated — matches refreshed");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: ResumeRow) {
    if (!confirm(`Delete “${r.fileName}”? Tailored resumes made from it are deleted too.`)) return;
    setBusy(r.id);
    try {
      await api(`/api/resume/${r.id}`, { method: "DELETE" });
      toast.success("Resume deleted");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Resumes</CardTitle>
          <CardDescription>The primary resume drives your matches and tailoring. Up to 5 are kept.</CardDescription>
        </div>
        <Button asChild size="sm">
          <Link href="/onboarding">
            <Upload /> Upload new
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {resumes.length === 0 ? <p className="text-sm text-muted-foreground">No resumes yet.</p> : null}
        <ul className="divide-y">
          {resumes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-5 shrink-0 text-gold-ink" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.fileName}</p>
                  <p className="text-xs text-muted-foreground">Uploaded {new Date(r.createdAt).toLocaleDateString("en-IN")}</p>
                </div>
                {r.isPrimary ? <Badge variant="gold">Primary</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!r.isPrimary ? (
                  <Button variant="outline" size="sm" onClick={() => makePrimary(r.id)} loading={busy === r.id}>
                    <Star /> Make primary
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={r.isPrimary ? "/onboarding" : `/ats`}>{r.isPrimary ? "Edit profile" : "ATS check"}</Link>
                </Button>
                {r.hasFile ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/api/resume/${r.id}/file`} aria-label={`Download ${r.fileName}`}>
                      <Download /> Original
                    </a>
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => remove(r)} loading={busy === r.id} aria-label={`Delete ${r.fileName}`}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DangerZone() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function destroy() {
    setBusy(true);
    try {
      await api("/api/account", { method: "DELETE", json: { confirm: "DELETE" } });
      toast.success("Your account and all data were deleted.");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>Download everything we store about you, or delete it all permanently.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Button asChild variant="outline">
          <a href="/api/account/export"><Download /> Download my data (JSON)</a>
        </Button>
        <div className="space-y-3 rounded-card border border-danger/40 p-4">
          <p className="font-semibold text-danger">Delete my account and all data</p>
          <p className="text-sm text-muted-foreground">Removes your resumes (including stored files), matches, tailored resumes, applications, saved searches, reviews and sign-in. This can&apos;t be undone.</p>
          <Field label="Type DELETE to confirm" htmlFor="del-confirm">
            <Input id="del-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </Field>
          <Button variant="danger" disabled={text !== "DELETE"} loading={busy} onClick={destroy}>
            <Trash2 /> Delete everything
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
