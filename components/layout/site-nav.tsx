"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/hidden", label: "Hidden jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/tracker", label: "Tracker" },
  { href: "/searches", label: "Saved searches" },
  { href: "/ats", label: "ATS checker" },
];

export function SiteNav({ signedIn, email }: { signedIn: boolean; email?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile menu after navigating
  useEffect(() => setOpen(false), [pathname]);

  const linkCls = (href: string) =>
    cn(
      "rounded-button px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted",
      pathname === href || pathname.startsWith(`${href}/`) ? "bg-muted text-foreground" : "text-muted-foreground",
    );

  return (
    <>
      {signedIn ? (
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkCls(l.href)} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        {signedIn ? (
          <>
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/settings" title={email}>
                Settings
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
              {open ? <X /> : <Menu />}
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login?next=/onboarding">Upload resume</Link>
            </Button>
          </>
        )}
      </div>

      {signedIn && open ? (
        <nav id="mobile-menu" aria-label="Mobile" className="absolute inset-x-0 top-full z-40 border-b bg-background p-4 shadow-lg lg:hidden">
          <ul className="grid gap-1">
            {[...LINKS, { href: "/settings", label: "Settings" }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={cn(linkCls(l.href), "block py-3 text-base")}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
