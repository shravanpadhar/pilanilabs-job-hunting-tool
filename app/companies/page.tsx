import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyLogo } from "@/components/jobs/company-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim().slice(0, 80);

  const groups = await db.job.groupBy({
    by: ["companySlug"],
    where: { ownerUserId: null, postedAt: { gte: daysAgo(30) }, ...(q ? { company: { contains: q, mode: "insensitive" } } : {}) },
    _count: { _all: true },
    _max: { company: true, companyLogoUrl: true },
    orderBy: { _count: { companySlug: "desc" } },
    take: 60,
  });
  const profiles = await db.companyProfile.findMany({ where: { slug: { in: groups.map((g) => g.companySlug) } }, include: { reviews: { select: { rating: true } } } });
  const bySlug = new Map(profiles.map((p) => [p.slug, p]));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Companies</h1>
        <p className="text-muted-foreground">Open roles, funding stage and community reviews for companies hiring now.</p>
      </header>

      <form role="search" className="flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search companies" aria-label="Search companies" className="pl-10" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {groups.length === 0 ? (
        <EmptyState icon={<Building2 className="size-10" />} title="No companies found">
          Try a different name, or load jobs first with <code>npm run db:seed</code> / <code>npm run fetch-jobs</code>.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const p = bySlug.get(g.companySlug);
            const name = p?.name ?? g._max.company ?? g.companySlug;
            const avg = p && p.reviews.length ? p.reviews.reduce((n, r) => n + r.rating, 0) / p.reviews.length : null;
            return (
              <li key={g.companySlug}>
                <Card className="h-full p-4 transition-shadow hover:shadow-md">
                  <Link href={`/companies/${g.companySlug}`} className="flex gap-3">
                    <CompanyLogo name={name} src={p?.logoUrl ?? g._max.companyLogoUrl} />
                    <div className="min-w-0 space-y-1.5">
                      <h2 className="truncate font-sans text-lg font-semibold">{name}</h2>
                      <p className="text-sm text-muted-foreground">{g._count._all} open {g._count._all === 1 ? "role" : "roles"}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {p?.fundingStage ? <Badge variant="muted">{p.fundingStage}</Badge> : null}
                        {p?.industry ? <Badge variant="default">{p.industry}</Badge> : null}
                        {avg ? <Badge variant="gold">★ {avg.toFixed(1)} ({p!.reviews.length})</Badge> : null}
                      </div>
                    </div>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
