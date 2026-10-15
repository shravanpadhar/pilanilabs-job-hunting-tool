"use client";

import { Bookmark, BookmarkCheck, Building2, Clock, EyeOff, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/jobs/company-logo";
import { MatchBadge } from "@/components/jobs/match-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { isHiddenJob } from "@/lib/jobs/hidden";
import { EMPLOYMENT_LABEL, formatSalary, sourceLabel, timeAgo } from "@/lib/format";
import type { FeedItem } from "@/lib/jobs/query";

type ClientItem = Omit<FeedItem, "job"> & { job: Omit<FeedItem["job"], "postedAt"> & { postedAt: string | Date } };

export function JobCard({ item }: { item: ClientItem }) {
  const { job, match } = item;
  const [saved, setSaved] = useState(Boolean(item.saved));
  const [busy, setBusy] = useState(false);
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);

  async function toggleSave() {
    if (saved) return;
    setBusy(true);
    try {
      await api("/api/applications", { method: "POST", json: { jobId: job.id, status: "SAVED" } });
      setSaved(true);
      toast.success("Saved to your tracker");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 transition-shadow hover:shadow-md sm:p-5">
      <article className="flex gap-3 sm:gap-4" aria-label={`${job.title} at ${job.company}`}>
        <CompanyLogo name={job.company} src={job.companyLogoUrl} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-sans text-lg font-semibold leading-snug">
                <Link href={`/jobs/${job.id}`} className="hover:underline focus-visible:underline">
                  {job.title}
                </Link>
              </h3>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <Building2 className="size-3.5" aria-hidden />
                <Link href={`/companies/${job.companySlug}`} className="font-medium hover:underline">
                  {job.company}
                </Link>
              </p>
            </div>
            {match ? <MatchBadge score={match.score} ai={match.aiScored} /> : null}
          </div>

          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {job.location ? (
              <li className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {job.location}
              </li>
            ) : null}
            {salary ? (
              <li className="flex items-center gap-1">
                <Wallet className="size-3.5" aria-hidden /> {salary}
              </li>
            ) : null}
            <li className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {timeAgo(job.postedAt)}
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-1.5">
            {job.isRemote ? <Badge variant="gold">Remote</Badge> : null}
            {job.employmentType ? <Badge variant="muted">{EMPLOYMENT_LABEL[job.employmentType]}</Badge> : null}
            {isHiddenJob(job) ? (
              <Badge variant="success">
                <EyeOff className="size-3" aria-hidden /> Company career page
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{sourceLabel(job.source, job.publisher)}</span>
          </div>

          {match?.reason ? <p className="text-sm">{match.reason}</p> : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/jobs/${job.id}`}>View details</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleSave} loading={busy} disabled={saved} aria-pressed={saved}>
              {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
      </article>
    </Card>
  );
}

export function JobCardSkeleton() {
  return (
    <Card className="p-5" aria-hidden>
      <div className="flex gap-4">
        <div className="size-11 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </Card>
  );
}
