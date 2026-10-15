/** Display helpers that are safe to use in both server and client components. */

export function timeAgo(date: Date | string, now = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$", SGD: "S$", AED: "AED " };

function compact(n: number, currency: string): string {
  if (currency === "INR") {
    if (n >= 10_000_000) return `${+(n / 10_000_000).toFixed(2)} Cr`;
    if (n >= 100_000) return `${+(n / 100_000).toFixed(2)} L`;
    return n.toLocaleString("en-IN");
  }
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function formatSalary(min?: number | null, max?: number | null, currency?: string | null): string | null {
  if (!min && !max) return null;
  const cur = currency || "USD";
  const sym = CURRENCY_SYMBOL[cur] ?? `${cur} `;
  if (min && max && min !== max) return `${sym}${compact(min, cur)} – ${sym}${compact(max, cur)}`;
  return `${sym}${compact((max ?? min) as number, cur)}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
};

export const WORK_MODE_LABEL: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };

export const SOURCE_LABEL: Record<string, string> = {
  jsearch: "JSearch",
  adzuna: "Adzuna",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  arbeitnow: "Arbeitnow",
  jobicy: "Jobicy",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  seed: "Sample data",
};

export function sourceLabel(source: string, publisher?: string | null): string {
  const base = SOURCE_LABEL[source] ?? source;
  return publisher && publisher.toLowerCase() !== base.toLowerCase() ? `via ${base} · originally on ${publisher}` : `via ${base}`;
}
