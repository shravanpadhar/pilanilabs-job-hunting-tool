import { ExternalLink, Globe, MapPin, Star, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/companies/review-form";
import { CompanyLogo } from "@/components/jobs/company-logo";
import { JobCard } from "@/components/jobs/job-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PROFILES_AS_OF } from "@/config/company-profiles";
import { linkedinSearchLinks } from "@/lib/ai/referral-labels";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { attachSaved, jobCardSelect } from "@/lib/jobs/query";
import { daysAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await db.companyProfile.findUnique({ where: { slug }, select: { name: true } }).catch(() => null);
  return { title: p?.name ?? "Company" };
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-4 ${n <= Math.round(value) ? "fill-primary text-primary" : "text-input-border"}`} aria-hidden />
      ))}
    </span>
  );
}

const REL: Record<string, string> = { CURRENT: "Current employee", FORMER: "Former employee", INTERVIEWED: "Interviewed" };

export default async function CompanyPage({ params }: Props) {
  const user = await requireUser();
  const { slug } = await params;

  const [profile, jobs] = await Promise.all([
    db.companyProfile.findUnique({ where: { slug }, include: { reviews: { orderBy: { createdAt: "desc" } } } }),
    db.job.findMany({
      where: { ownerUserId: null, companySlug: slug, postedAt: { gte: daysAgo(30) } },
      orderBy: { postedAt: "desc" },
      take: 30,
      select: { ...jobCardSelect, matches: { where: { userId: user.id }, take: 1, select: { score: true, reason: true, aiScored: true, matchingSkills: true, missingSkills: true, experienceFit: true } } },
    }),
  ]);
  if (!profile && jobs.length === 0) notFound();

  const name = profile?.name ?? jobs[0].company;
  const logo = profile?.logoUrl ?? jobs.find((j) => j.companyLogoUrl)?.companyLogoUrl ?? null;
  const items = (await attachSaved(user.id, { items: jobs.map(({ matches, ...job }) => ({ job, match: matches[0] ?? null })), total: jobs.length, page: 1, hasMore: false })).items;

  const reviews = profile?.reviews ?? [];
  const avg = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : null;
  const mine = reviews.find((r) => r.userId === user.id);
  const links = linkedinSearchLinks(name);
  const enc = encodeURIComponent(name);

  return (
    <div className="space-y-8">
      <Link href="/companies" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← All companies</Link>

      <header className="flex flex-wrap gap-4">
        <CompanyLogo name={name} src={logo} className="size-16" />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">{name}</h1>
          {profile?.description ? <p className="max-w-3xl text-muted-foreground">{profile.description}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {profile?.fundingStage ? <Badge variant="gold">{profile.fundingStage}</Badge> : null}
            {profile?.industry ? <Badge>{profile.industry}</Badge> : null}
            {avg ? (
              <Badge variant="muted">
                <Stars value={avg} /> {avg.toFixed(1)} · {reviews.length} review{reviews.length > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0 space-y-4" aria-labelledby="roles-h">
          <h2 id="roles-h" className="text-2xl font-semibold">Open roles ({items.length})</h2>
          {items.length === 0 ? (
            <p className="text-muted-foreground">No recent openings in our database for this company.</p>
          ) : (
            <ul className="grid gap-3">
              {items.map((item) => (
                <li key={item.job.id}>
                  <JobCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-heading text-xl font-semibold">Company facts</h2>
            <dl className="space-y-2 text-sm">
              {profile?.hqLocation ? <div className="flex gap-2"><dt className="sr-only">Headquarters</dt><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd>{profile.hqLocation}</dd></div> : null}
              {profile?.foundedYear ? <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">Founded</dt><dd>{profile.foundedYear}</dd></div> : null}
              {profile?.sizeRange ? <div className="flex gap-2"><dt className="sr-only">Size</dt><Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd>{profile.sizeRange} employees</dd></div> : null}
              {profile?.fundingStage ? <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">Stage</dt><dd>{profile.fundingStage}</dd></div> : null}
              {profile?.website ? <div className="flex gap-2"><dt className="sr-only">Website</dt><Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd><a className="underline" href={profile.website} target="_blank" rel="noopener noreferrer">{profile.website.replace(/^https?:\/\//, "")}</a></dd></div> : null}
            </dl>
            {!profile?.fundingStage && !profile?.hqLocation ? <p className="text-sm text-muted-foreground">We don&apos;t have verified facts for this company yet.</p> : null}
            <p className="text-xs text-muted-foreground">
              Facts are curated from public information{profile?.dataAsOf ? ` (as of ${formatDate(profile.dataAsOf)})` : ` (as of ${PROFILES_AS_OF})`} and can be out of date — verify on the company&apos;s site.
            </p>
          </Card>

          <Card className="space-y-2 p-5">
            <h2 className="font-heading text-xl font-semibold">Research elsewhere</h2>
            <p className="text-sm text-muted-foreground">Employer ratings on other sites are theirs to share — we link, we don&apos;t copy.</p>
            <div className="grid gap-2">
              <Button asChild variant="outline" size="sm"><a href={`https://www.glassdoor.co.in/Search/results.htm?keyword=${enc}`} target="_blank" rel="noopener noreferrer"><ExternalLink /> Glassdoor reviews</a></Button>
              <Button asChild variant="outline" size="sm"><a href={`https://www.google.com/search?q=${enc}+employee+reviews+ambitionbox`} target="_blank" rel="noopener noreferrer"><ExternalLink /> AmbitionBox & others</a></Button>
              <Button asChild variant="outline" size="sm"><a href={links.company} target="_blank" rel="noopener noreferrer"><ExternalLink /> LinkedIn company</a></Button>
            </div>
          </Card>
        </aside>
      </div>

      <section className="space-y-4" aria-labelledby="reviews-h">
        <h2 id="reviews-h" className="text-2xl font-semibold">Community reviews</h2>
        <Notice tone="info">Reviews here are written by Pilanilabs users, anonymously. They are not imported from Glassdoor or any other site.</Notice>
        {reviews.length === 0 ? <p className="text-muted-foreground">No reviews yet — be the first.</p> : null}
        <ul className="grid gap-3 md:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card className="h-full space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars value={r.rating} />
                  <span className="text-xs text-muted-foreground">{REL[r.relationship]}{r.roleTitle ? ` · ${r.roleTitle}` : ""} · {formatDate(r.createdAt)}</span>
                </div>
                <h3 className="font-sans text-base font-semibold">{r.title}</h3>
                <p className="text-sm"><strong className="text-success">Pros:</strong> {r.pros}</p>
                <p className="text-sm"><strong className="text-danger">Cons:</strong> {r.cons}</p>
              </Card>
            </li>
          ))}
        </ul>
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-xl font-semibold">{mine ? "Edit your review" : "Write a review"}</h3>
          <ReviewForm
            slug={slug}
            initial={mine ? { rating: mine.rating, title: mine.title, pros: mine.pros, cons: mine.cons, roleTitle: mine.roleTitle ?? "", relationship: mine.relationship as "CURRENT" | "FORMER" | "INTERVIEWED" } : undefined}
          />
        </Card>
      </section>
    </div>
  );
}
