"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Company logo with a lettered fallback (logos come from third parties and often 404). */
export function CompanyLogo({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const base = cn("size-11 shrink-0 rounded-[6px] border bg-card object-contain", className);
  if (!src || failed) {
    return (
      <span aria-hidden className={cn(base, "grid place-items-center bg-link font-heading text-lg font-bold text-secondary")}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- third-party logo URLs; next/image would need an allow-list per host
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={base} onError={() => setFailed(true)} />;
}
