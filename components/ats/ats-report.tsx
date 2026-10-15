import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { scoreTone } from "@/components/jobs/match-badge";
import type { AtsReport } from "@/lib/resume/ats";
import { cn } from "@/lib/utils";

function ScoreBlock({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  if (value === null) return null;
  const tone = scoreTone(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={cn("font-heading text-xl font-bold", tone.ring.split(" ")[1])}>{value}%</span>
      </div>
      <Progress value={value} label={label} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AtsReportView({ report }: { report: AtsReport }) {
  const tone = scoreTone(report.overall);
  return (
    <div className="space-y-5">
      <Card className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-4">
          <span className={cn("grid size-24 place-items-center rounded-full border-4 font-heading text-4xl font-bold", tone.ring)} role="img" aria-label={`Overall ATS score ${report.overall} out of 100`}>
            {report.overall}
          </span>
          <div>
            <p className="font-heading text-2xl font-semibold">ATS score</p>
            <p className="text-sm text-muted-foreground">{report.overall >= 80 ? "Looks ATS-ready." : report.overall >= 60 ? "Decent — a few fixes will help." : "Needs work before you apply."}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ScoreBlock label="Parsing" value={report.parseScore} hint="Can a parser read your fields?" />
          <ScoreBlock label="Format" value={report.formatScore} hint="Layout, length, symbols" />
          <ScoreBlock label="Keywords" value={report.keywordScore} hint="Coverage of the job's keywords" />
        </div>
      </Card>

      {report.keywords ? (
        <Card className="space-y-3 p-5">
          <h3 className="font-heading text-xl font-semibold">Keyword coverage</h3>
          <p className="text-sm text-muted-foreground">
            Your resume covers {report.keywords.matched.length} of {report.keywords.results.length} keywords from this job description. Only add missing ones you genuinely have experience with.
          </p>
          <div className="space-y-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-success">Found</p>
              <div className="flex flex-wrap gap-1.5">
                {report.keywords.results.filter((r) => r.found).map((r) => (
                  <Badge key={r.keyword} variant="success">{r.keyword}</Badge>
                ))}
                {report.keywords.matched.length === 0 ? <span className="text-sm text-muted-foreground">None yet.</span> : null}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warning">Missing</p>
              <div className="flex flex-wrap gap-1.5">
                {report.keywords.results.filter((r) => !r.found).map((r) => (
                  <Badge key={r.keyword} variant="warning">{r.keyword}</Badge>
                ))}
                {report.keywords.missing.length === 0 ? <span className="text-sm text-muted-foreground">Nothing missing — nice.</span> : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="mb-3 font-heading text-xl font-semibold">Checks</h3>
        <ul className="divide-y">
          {report.checks.map((c) => (
            <li key={c.id} className="flex gap-3 py-2.5">
              {c.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Passed" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-label="Needs attention" />}
              <div>
                <p className="font-semibold">{c.label}</p>
                <p className="text-sm text-muted-foreground">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
