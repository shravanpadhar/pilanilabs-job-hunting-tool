import { SearchX, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FeedFilters } from "@/components/jobs/feed-filters";
import { JobFeed } from "@/components/jobs/job-feed";
import { RefreshMatchesButton } from "@/components/jobs/refresh-matches-button";
import { SaveSearchDialog } from "@/components/jobs/save-search-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { filtersToSearchParams, parseFilters } from "@/lib/jobs/filters";
import { attachSaved, queryMatchedFeed } from "@/lib/jobs/query";

export const metadata: Metadata = { title: "Your job feed" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const query = filtersToSearchParams(filters).toString();

  const [resume, totalJobs] = await Promise.all([
    db.resume.findFirst({ where: { userId: user.id, isPrimary: true }, select: { id: true } }),
    db.job.count({ where: { ownerUserId: null } }),
  ]);

  if (!resume) {
    return (
      <EmptyState
        icon={<Upload className="size-10" />}
        title="Upload your resume to see matches"
        action={
          <Button asChild>
            <Link href="/onboarding">Upload resume</Link>
          </Button>
        }
      >
        We rank every new job against your skills, experience and preferences. It takes about a minute.
      </EmptyState>
    );
  }

  const page = await attachSaved(user.id, await queryMatchedFeed(user.id, filters, 1));
  const hasFilters = query.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Your job feed</h1>
          <p className="text-muted-foreground" aria-live="polite">
            {page.total.toLocaleString("en-IN")} {page.total === 1 ? "job matches" : "jobs match"} your profile
            {hasFilters ? " and filters" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SaveSearchDialog filters={filters} />
          <RefreshMatchesButton />
        </div>
      </header>

      {!flags.ai ? (
        <Notice tone="info" title="Keyword scoring only">
          AI match scoring is off (no AI key configured), so scores come from skill, title and location overlap.
        </Notice>
      ) : null}

      <FeedFilters action="/jobs" filters={filters} />

      {page.items.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-10" />}
          title={totalJobs === 0 ? "No jobs loaded yet" : hasFilters ? "No jobs match these filters" : "No matches yet"}
          action={
            hasFilters ? (
              <Button asChild variant="secondary">
                <Link href="/jobs">Clear filters</Link>
              </Button>
            ) : (
              <RefreshMatchesButton label="Find matches now" />
            )
          }
        >
          {totalJobs === 0
            ? "The job database is empty. Run `npm run db:seed` for sample jobs or `npm run fetch-jobs` to pull live jobs."
            : hasFilters
              ? "Try a wider posting window, remove the location filter, or lower the minimum match score."
              : "Try widening your locations or target roles in Settings, then refresh. New jobs arrive every few hours."}
        </EmptyState>
      ) : (
        <JobFeed key={query} initialItems={page.items} initialHasMore={page.hasMore} query={query} feed="matched" />
      )}
    </div>
  );
}
