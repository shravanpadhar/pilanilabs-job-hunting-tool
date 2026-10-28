import { ArrowLeft, Building2, Calendar, ExternalLink, MapPin, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/components/jobs/company-logo";
import { JobActions } from "@/components/jobs/job-actions";
import { JobTabs } from "@/components/jobs/job-tabs";
import { MatchBadge, scoreTone } from "@/components/jobs/match-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { linkedinSearchLinks } from "@/lib/ai/referral-labels";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isHiddenJob } from "@/lib/jobs/hidden";
import { cleanHtml } from "@/lib/sources/normalize";
import { EMPLOYMENT_LABEL, formatDate, formatSalary, SOURCE_LABEL, sourceLabel, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const job = await db.job.findFirst({ where: { id, ownerUserId: null }, select: { title: true, company: true } }).catch(() => null);
  return { title: job ? `${job.title} at ${job.company}` : "Job" };
}

const FIT_TEXT = { UNDER: "You have less experience than this role seems to ask for.", FIT: "Your experience level fits this role.", OVER: "You may be more senior than this role." } as const;

export default async function JobDetailPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  const [job, match, application, resume] = await Promise.all([
    db.job.findFirst({ where: { id, OR: [{ ownerUserId: null }, { ownerUserId: user.id }] } }),
    db.match.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } } }),
    db.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } } }),
    db.resume.findFirst({ where: { userId: user.id, isPrimary: true }, select: { id: true } }),
  ]);
  if (!job) notFound();

  const tailored = resume
    ? await db.tailoredResume.findUnique({ where: { userId_jobId_baseResumeId: { userId: user.id, jobId: id, baseResumeId: resume.id } }, select: { id: true, changes: true, coverLetterText: true } })
    : null;
  const hasTailored = Boolean(tailored && tailored.changes !== null);
  const profile = await db.companyProfile.findUnique({ where: { slug: job.companySlug }, select: { fundingStage: true, industry: true } });

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const sourceName = SOURCE_LABEL[job.source] ?? job.source;
  const links = linkedinSearchLinks(job.company, job.title);

  const description = (
    <Card className="p-5 sm:p-7">
      {job.descriptionHtml ? (
        <div className="prose-job" dangerouslySetInnerHTML={{ __html: cleanHtml(job.descriptionHtml) }} />
      ) : job.descriptionText ? (
        <div className="prose-job whitespace-pre-line">{job.descriptionText}</div>
      ) : (
        <p className="text-muted-foreground">This listing has no description. Open the original posting for details.</p>
      )}
      {job.descriptionText.length > 0 && job.descriptionText.length < 400 ? (
        <p className="mt-4 rounded-card bg-muted p-3 text-sm text-muted-foreground">This source only shares a short summary. The full description is on the original posting.</p>
      ) : null}
    </Card>
  );

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to feed
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <header className="flex gap-4">
            <CompanyLogo name={job.company} src={job.companyLogoUrl} className="size-14" />
            <div className="min-w-0 space-y-2">
              <h1 className="text-3xl font-semibold sm:text-4xl">{job.title}</h1>
              <p className="flex flex-wrap items-center gap-x-2 text-lg">
                <Building2 className="size-4 text-muted-foreground" aria-hidden />
                <Link href={`/companies/${job.companySlug}`} className="font-semibold hover:underline">
                  {job.company}
                </Link>
                {profile?.fundingStage ? <Badge variant="muted">{profile.fundingStage}</Badge> : null}
              </p>
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                {job.location ? <li className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden /> {job.location}</li> : null}
                {salary ? <li className="flex items-center gap-1.5"><Wallet className="size-4" aria-hidden /> {salary} / year</li> : null}
                <li className="flex items-center gap-1.5"><Calendar className="size-4" aria-hidden /> Posted {formatDate(job.postedAt)} ({timeAgo(job.postedAt)})</li>
              </ul>
              <div className="flex flex-wrap items-center gap-1.5">
                {job.isRemote ? <Badge variant="gold">Remote</Badge> : null}
                {job.employmentType ? <Badge variant="muted">{EMPLOYMENT_LABEL[job.employmentType]}</Badge> : null}
                {isHiddenJob(job) ? <Badge variant="success">Company career page</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {sourceLabel(job.source, job.publisher)}
                {job.attributionUrl ? (
                  <>
                    {" · "}
                    <a className="inline-flex items-center gap-1 underline" href={job.attributionUrl} target="_blank" rel="noopener noreferrer">
                      Original listing on {sourceName} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </header>

          <JobTabs
            jobId={job.id}
            company={job.company}
            description={description}
            hasResume={Boolean(resume)}
            hasTailored={hasTailored}
            coverLetter={tailored?.coverLetterText ?? null}
            links={links}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Match and actions">
          <Card className="space-y-4 p-5">
            {match ? (
              <>
                <div className="flex items-center gap-4">
                  <MatchBadge score={match.score} size="lg" ai={match.aiScored} />
                  <div>
                    <p className="font-heading text-xl font-semibold">{scoreTone(match.score).label}</p>
                    <p className="text-xs text-muted-foreground">{match.aiScored ? "Scored by AI" : "Keyword-based score"}</p>
                  </div>
                </div>
                {match.reason ? <p className="text-sm">{match.reason}</p> : null}
                {match.experienceFit ? <p className="text-sm text-muted-foreground">{FIT_TEXT[match.experienceFit]}</p> : null}
                {match.matchingSkills.length ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-success">Skills you have</p>
                    <div className="flex flex-wrap gap-1.5">{match.matchingSkills.map((s) => <Badge key={s} variant="success">{s}</Badge>)}</div>
                  </div>
                ) : null}
                {match.missingSkills.length ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warning">Gaps to consider</p>
                    <div className="flex flex-wrap gap-1.5">{match.missingSkills.map((s) => <Badge key={s} variant="warning">{s}</Badge>)}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {resume ? "This job isn't among your top matches (it may fall outside your location, work-mode or salary preferences). The ATS tab still shows how your resume compares." : "Upload your resume to see how well you match."}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <JobActions jobId={job.id} applyUrl={job.applyUrl} sourceName={sourceName} status={application?.status ?? null} tailoredResumeId={hasTailored ? tailored!.id : null} hasResume={Boolean(resume)} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
