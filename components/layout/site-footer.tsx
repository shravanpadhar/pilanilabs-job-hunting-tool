import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card/60">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            © {new Date().getFullYear()} <a className="font-semibold text-foreground underline" href={siteConfig.parentSite}>Pilanilabs</a>. Resumes are stored privately and never sold.
          </p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/privacy" className="underline">Privacy</Link>
            <Link href="/ats" className="underline">ATS checker</Link>
          </nav>
        </div>
        <p className="text-xs">
          Jobs are aggregated from{" "}
          Google for Jobs (via{" "}
          <a className="underline" href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" rel="noopener noreferrer">JSearch</a>), Adzuna (
          <a className="underline" href="https://www.adzuna.in" rel="noopener noreferrer">Jobs by Adzuna</a>),{" "}
          <a className="underline" href="https://remotive.com" rel="noopener noreferrer">Remotive</a>,{" "}
          <a className="underline" href="https://remoteok.com" rel="noopener noreferrer">Remote OK</a>,{" "}
          <a className="underline" href="https://www.arbeitnow.com" rel="noopener noreferrer">Arbeitnow</a>,{" "}
          <a className="underline" href="https://jobicy.com" rel="noopener noreferrer">Jobicy</a> and public Greenhouse, Lever and Ashby career pages. Each job links to its original posting; always apply on the original site.
        </p>
      </div>
    </footer>
  );
}
