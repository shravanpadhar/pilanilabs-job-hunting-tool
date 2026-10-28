import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TailorWorkspace } from "@/components/resume/tailor-workspace";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { SOURCE_LABEL } from "@/lib/format";
import { resumeSchema } from "@/lib/resume/schema";

export const metadata: Metadata = { title: "Tailor your resume" };
export const dynamic = "force-dynamic";

export default async function TailorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [job, resume] = await Promise.all([
    db.job.findFirst({ where: { id, OR: [{ ownerUserId: null }, { ownerUserId: user.id }] }, select: { id: true, title: true, company: true, applyUrl: true, source: true } }),
    db.resume.findFirst({ where: { userId: user.id, isPrimary: true } }),
  ]);
  if (!job) notFound();
  if (!resume) redirect("/onboarding");

  const [row, application] = await Promise.all([
    db.tailoredResume.findUnique({ where: { userId_jobId_baseResumeId: { userId: user.id, jobId: id, baseResumeId: resume.id } } }),
    db.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } }, select: { status: true } }),
  ]);
  const hasTailored = row && row.changes !== null;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href={`/jobs/${job.id}`} className="underline">{job.title}</Link> · {job.company}
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Tailored resume</h1>
      </header>
      <TailorWorkspace
        job={{ id: job.id, title: job.title, company: job.company, applyUrl: job.applyUrl }}
        original={resumeSchema.parse(resume.parsedJson)}
        initial={
          hasTailored
            ? {
                id: row.id,
                tailored: resumeSchema.parse(row.contentJson),
                changes: (row.changes as Array<{ section: string; change: string; reason?: string }>) ?? [],
                skillGaps: (row.skillGaps as string[] | null) ?? [],
              }
            : null
        }
        coverLetter={row?.coverLetterText ?? null}
        applicationStatus={application?.status ?? null}
        sourceName={SOURCE_LABEL[job.source] ?? job.source}
        aiEnabled={flags.ai}
      />
    </div>
  );
}
