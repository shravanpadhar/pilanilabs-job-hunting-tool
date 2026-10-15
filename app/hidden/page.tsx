import { EyeOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddBoardForm } from "@/components/jobs/add-board-form";
import { FeedFilters } from "@/components/jobs/feed-filters";
import { JobFeed } from "@/components/jobs/job-feed";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { COMPANY_BOARDS } from "@/config/companies";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { filtersToSearchParams, parseFilters } from "@/lib/jobs/filters";
import { attachSaved, queryJobs } from "@/lib/jobs/query";

export const metadata: Metadata = { title: "Hidden jobs" };
export const dynamic = "force-dynamic";

export default async function HiddenJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const query = filtersToSearchParams(filters).toString();
  const [page, userBoards] = await Promise.all([
    queryJobs(user.id, filters, { hiddenOnly: true }).then((p) => attachSaved(user.id, p)),
    db.companyBoard.count({ where: { enabled: true } }),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-3xl font-semibold sm:text-4xl">
          <EyeOff className="size-8 text-gold-ink" aria-hidden /> Hidden jobs
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Openings read straight from company career pages on Greenhouse, Lever and Ashby that we have <strong>not</strong> seen on any job portal. Fewer applicants, and you apply directly with the employer.
          Tracking {COMPANY_BOARDS.length + userBoards} career pages.
        </p>
      </header>

      <Card className="p-4 sm:p-5">
        <AddBoardForm />
      </Card>

      <FeedFilters action="/hidden" filters={filters} showMatchFilters={false} />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {page.total.toLocaleString("en-IN")} hidden {page.total === 1 ? "job" : "jobs"}
      </p>

      {page.items.length === 0 ? (
        <EmptyState icon={<EyeOff className="size-10" />} title="No hidden jobs for these filters" action={query ? <Button asChild variant="secondary"><Link href="/hidden">Clear filters</Link></Button> : undefined}>
          Career pages are refreshed every few hours. Widen the posting window, or add more companies above.
        </EmptyState>
      ) : (
        <JobFeed key={query} initialItems={page.items} initialHasMore={page.hasMore} query={query} feed="hidden" />
      )}
    </div>
  );
}
