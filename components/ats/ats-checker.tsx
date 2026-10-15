"use client";

import { ScanSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AtsReportView } from "@/components/ats/ats-report";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { AtsReport } from "@/lib/resume/ats";

export function AtsChecker({ resumes }: { resumes: Array<{ id: string; fileName: string; isPrimary: boolean }> }) {
  const [resumeId, setResumeId] = useState(resumes.find((r) => r.isPrimary)?.id ?? resumes[0]?.id ?? "");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AtsReport | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ report: AtsReport }>("/api/ats/check", { method: "POST", json: { resumeId, jobDescription: jd || undefined } });
      setReport(res.report);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form onSubmit={run} className="space-y-4">
          <Field label="Resume" htmlFor="ats-resume">
            <Select id="ats-resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>{r.fileName}{r.isPrimary ? " (primary)" : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Job description (optional)" htmlFor="ats-jd" hint="Paste the full posting to also see keyword coverage. Leave empty for a general parsing and format check.">
            <Textarea id="ats-jd" rows={9} maxLength={30000} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description here…" />
          </Field>
          <Button type="submit" loading={busy}>
            <ScanSearch /> Check ATS score
          </Button>
        </form>
      </Card>
      {report ? <AtsReportView report={report} /> : null}
    </div>
  );
}
