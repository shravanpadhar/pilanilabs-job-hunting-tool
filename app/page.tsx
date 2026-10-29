import { ArrowRight, BellRing, Building2, EyeOff, FileSearch, FileText, Handshake, KanbanSquare, ScanSearch, ShieldCheck, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";

const STEPS = [
  { icon: Upload, title: "Upload your resume", body: "PDF or DOCX. We read it once, show you what we understood, and you fix anything we got wrong." },
  { icon: ScanSearch, title: "See jobs ranked for you", body: "Fresh listings from Google for Jobs, Adzuna, remote boards and company career pages — scored 0–100 against your profile." },
  { icon: Wand2, title: "Tailor and apply", body: "One click gives you a resume rewritten for that job, using only what is true about you. Download it and apply on the original site." },
];

const FEATURES = [
  { icon: EyeOff, title: "Hidden jobs", body: "Openings pulled straight from Greenhouse, Lever and Ashby career pages — many never reach the big portals." },
  { icon: FileSearch, title: "ATS score checker", body: "See how well your resume parses and how many keywords from a job description it covers." },
  { icon: BellRing, title: "Alerts & saved searches", body: "Name a search, subscribe, and get the top new matches by email or WhatsApp — daily or weekly." },
  { icon: Building2, title: "Company pages", body: "Open roles, funding stage and honest community reviews for each company in one place." },
  { icon: Handshake, title: "Referral helper", body: "Drafts a polite LinkedIn note to an employee. You review and send it yourself — nothing is automated." },
  { icon: KanbanSquare, title: "Application tracker", body: "Saved → Applied → Interviewing → Offer. Notes and follow-up dates included." },
];

export default async function LandingPage() {
  const user = await getCurrentUser().catch(() => null);
  const cta = user ? "/jobs" : "/login?next=/onboarding";
  return (
    <div className="space-y-20 sm:space-y-28">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.2fr_1fr] lg:pt-10">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-semibold text-gold-ink">
            <ShieldCheck className="size-4" aria-hidden /> Built for job seekers in India · works for remote roles worldwide
          </p>
          <h1 className="text-[2.6rem] font-semibold sm:text-6xl lg:text-[68px]">{siteConfig.tagline}</h1>
          <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">
            Stop scrolling ten job sites. Upload once, get a ranked feed of recent roles, and apply with a resume tailored to each one.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={cta}>
                <Upload /> Upload resume
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="#how-it-works">
                How it works <ArrowRight />
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Free to start · Your resume stays private · We never apply on your behalf</p>
        </div>

        <Card className="relative overflow-hidden p-5" aria-hidden>
          <div className="space-y-3">
            {[
              ["Senior Product Manager", "Fintech scale-up · Bengaluru", 92],
              ["Frontend Engineer (React)", "Remote · India", 86],
              ["Data Analyst", "Hybrid · Pune", 74],
            ].map(([t, c, s]) => (
              <div key={t as string} className="flex items-center justify-between gap-3 rounded-card border bg-background p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t}</p>
                  <p className="truncate text-sm text-muted-foreground">{c}</p>
                </div>
                <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-primary font-heading text-lg font-bold text-gold-ink">{s}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-card bg-secondary p-3.5 text-sm text-secondary-foreground">
              <FileText className="size-4 text-primary" /> Resume tailored for “Frontend Engineer” — 6 changes, 0 invented facts
            </div>
          </div>
        </Card>
      </section>

      <section id="how-it-works" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-3xl font-semibold sm:text-5xl">How it works</h2>
          <p className="text-muted-foreground">Three steps from resume to application.</p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full space-y-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-secondary font-heading text-lg font-bold text-brand dark:bg-brand dark:text-secondary">{i + 1}</span>
                  <s.icon className="size-5 text-gold-ink" aria-hidden />
                </div>
                <h3 className="text-2xl font-semibold">{s.title}</h3>
                <p className="text-muted-foreground">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-3xl font-semibold sm:text-5xl">Everything around the application</h2>
          <p className="text-muted-foreground">The extras that turn a job list into a job search.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Card className="h-full space-y-2 p-5">
                <f.icon className="size-6 text-gold-ink" aria-hidden />
                <h3 className="text-xl font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-card bg-secondary px-6 py-12 text-center text-secondary-foreground sm:px-12">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold text-white sm:text-4xl">Ready to see this week’s best matches?</h2>
        <p className="mx-auto mt-3 max-w-xl text-[#CED9E5]">Upload your resume and your first ranked feed is ready in about a minute.</p>
        <Button asChild size="lg" className="mt-6">
          <Link href={cta}>
            <Upload /> Upload resume
          </Link>
        </Button>
      </section>
    </div>
  );
}
