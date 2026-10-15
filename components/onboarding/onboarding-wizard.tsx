"use client";

import { CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_PREFERENCES, PreferencesForm } from "@/components/onboarding/preferences-form";
import { ResumeEditor } from "@/components/resume/resume-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import { experienceBand } from "@/lib/resume/experience";
import type { ResumeData } from "@/lib/resume/schema";
import type { PreferencesInput } from "@/lib/validation";

type Step = "upload" | "parsing" | "review" | "preferences" | "matching";

const STEP_LABELS: Array<[Step, string]> = [
  ["upload", "Upload"],
  ["review", "Review profile"],
  ["preferences", "Preferences"],
  ["matching", "Find jobs"],
];

const PARSE_MESSAGES = ["Uploading your resume…", "Reading the document…", "Understanding your experience…", "Picking out your skills…", "Almost there…"];
const MAX_BYTES = 5 * 1024 * 1024;

export function OnboardingWizard({
  existing,
}: {
  existing: { id: string; parsed: ResumeData; fileName: string; preferences: PreferencesInput | null } | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(existing ? "review" : "upload");
  const [resumeId, setResumeId] = useState<string | null>(existing?.id ?? null);
  const [resume, setResume] = useState<ResumeData | null>(existing?.parsed ?? null);
  const [version, setVersion] = useState(0);
  const [prefs, setPrefs] = useState<PreferencesInput>(existing?.preferences ?? DEFAULT_PREFERENCES);
  const [error, setError] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState(true);
  const [msgIndex, setMsgIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "parsing") return;
    const t = setInterval(() => setMsgIndex((i) => Math.min(i + 1, PARSE_MESSAGES.length - 1)), 3500);
    return () => clearInterval(t);
  }, [step]);

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) return setError("That file is larger than 5 MB. Please upload a smaller PDF or DOCX.");
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError("Please upload a PDF or DOCX file.");
    setMsgIndex(0);
    setStep("parsing");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ id: string; parsed: ResumeData; usedAi: boolean }>("/api/resume/upload", { method: "POST", body: form });
      setResumeId(res.id);
      setResume(res.parsed);
      setUsedAi(res.usedAi);
      setVersion((v) => v + 1);
      // Pre-fill preferences from what we learned.
      setPrefs((p) => ({
        ...p,
        targetRoles: p.targetRoles.length ? p.targetRoles : res.parsed.inferredTargetRoles.slice(0, 3),
        locations: p.locations.length ? p.locations : res.parsed.contact.location ? [res.parsed.contact.location.split(",")[0].trim()] : [],
        experienceLevel: p.experienceLevel ?? experienceBand(res.parsed.totalYearsExperience),
      }));
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
      setStep("upload");
    }
  }

  async function saveProfileAndContinue() {
    if (!resumeId || !resume) return;
    setSaving(true);
    try {
      await api(`/api/resume/${resumeId}`, { method: "PATCH", json: { parsedJson: resume, isPrimary: true } });
      setStep("preferences");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setStep("matching");
    try {
      await api("/api/preferences", { method: "PUT", json: prefs });
      const summary = await api<{ kept: number; aiSkippedReason?: string }>("/api/matches/refresh", { method: "POST" });
      if (summary.kept === 0) toast.info("No strong matches yet — try widening your locations or roles. New jobs arrive every few hours.");
      router.push("/jobs");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setStep("preferences");
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = step === "parsing" ? 0 : STEP_LABELS.findIndex(([s]) => s === step);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">Set up your profile</h1>
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Progress">
          {STEP_LABELS.map(([s, label], i) => (
            <li key={s} aria-current={i === stepIndex ? "step" : undefined} className={i === stepIndex ? "font-bold text-foreground" : i < stepIndex ? "text-success" : "text-muted-foreground"}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </header>

      {error ? <Notice tone="warning">{error}</Notice> : null}

      {step === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload your resume</CardTitle>
            <CardDescription>PDF or DOCX, up to 5 MB. We store it privately and only you can open it.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
              className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-14 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-input-border"}`}
            >
              <UploadCloud className="size-10 text-gold-ink" aria-hidden />
              <p className="font-semibold">Drag your resume here</p>
              <p className="text-sm text-muted-foreground">or</p>
              <Button type="button" onClick={() => inputRef.current?.click()}>
                <FileUp /> Choose file
              </Button>
              <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Resume file" data-testid="resume-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            </div>
            {existing ? (
              <Button variant="ghost" className="mt-4" onClick={() => setStep("review")}>
                Keep my current resume ({existing.fileName})
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === "parsing" ? (
        <Card>
          <CardContent className="space-y-4 p-8 text-center" aria-live="polite">
            <Loader2 className="mx-auto size-9 animate-spin text-gold-ink" aria-hidden />
            <p className="font-heading text-2xl font-semibold">{PARSE_MESSAGES[msgIndex]}</p>
            <Progress value={((msgIndex + 1) / PARSE_MESSAGES.length) * 90} label="Parsing progress" />
            <p className="text-sm text-muted-foreground">This usually takes 10–30 seconds.</p>
          </CardContent>
        </Card>
      ) : null}

      {step === "review" && resume ? (
        <div className="space-y-5">
          {!usedAi ? (
            <Notice tone="warning" title="Basic parsing used">
              AI parsing isn&apos;t available (no AI key, or the AI service failed), so we used a simple parser. Please check every section carefully.
            </Notice>
          ) : (
            <Notice tone="info" title="Please review what we understood">
              Fix anything that looks wrong — your matches and tailored resumes are built from this profile. We never guess contact details; blank means we didn&apos;t find it.
            </Notice>
          )}
          <ResumeEditor value={resume} onChange={setResume} version={version} />
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-between gap-3 border-t bg-background/95 p-4 backdrop-blur sm:mx-0 sm:rounded-card sm:border">
            <Button variant="ghost" onClick={() => setStep("upload")}>Upload a different file</Button>
            <Button onClick={saveProfileAndContinue} loading={saving}>
              Looks good — continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "preferences" ? (
        <Card>
          <CardHeader>
            <CardTitle>What are you looking for?</CardTitle>
            <CardDescription>We use this to filter and rank jobs. You can change it any time in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PreferencesForm value={prefs} onChange={setPrefs} suggestedRoles={resume?.inferredTargetRoles ?? []} />
            <div className="flex flex-wrap justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep("review")}>Back</Button>
              <Button onClick={finish} loading={saving}>
                <CheckCircle2 /> Show my matches
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "matching" ? (
        <Card>
          <CardContent className="space-y-4 p-8 text-center" aria-live="polite">
            <Loader2 className="mx-auto size-9 animate-spin text-gold-ink" aria-hidden />
            <p className="font-heading text-2xl font-semibold">Finding and ranking jobs for you…</p>
            <p className="text-sm text-muted-foreground">Comparing recent postings with your skills, roles and preferences.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
