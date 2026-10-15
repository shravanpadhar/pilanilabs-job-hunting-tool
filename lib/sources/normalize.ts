import { convert } from "html-to-text";
import sanitizeHtml from "sanitize-html";
import type { JobType } from "@/generated/prisma/enums";

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

/** Greenhouse returns HTML that is itself entity-escaped. Decode one level. */
export function decodeEscapedHtml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
}

export function htmlToPlain(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "h4", options: { uppercase: false } },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Job descriptions come from third parties: strip scripts/styles/attributes before rendering. */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "h4", "h5", "blockquote", "a", "span", "div", "hr"],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
  });
}

export function plainToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function mapEmploymentType(raw?: string | string[] | null): JobType | null {
  const s = (Array.isArray(raw) ? raw.join(" ") : (raw ?? "")).toLowerCase().replace(/[-_]/g, " ");
  if (!s) return null;
  if (/intern/.test(s)) return "INTERNSHIP";
  if (/contract|freelance|temporary|temp\b/.test(s)) return "CONTRACT";
  if (/part ?time/.test(s)) return "PART_TIME";
  if (/full ?time|permanent|regular/.test(s)) return "FULL_TIME";
  return null;
}

const REMOTE_RE = /\b(remote|work from home|wfh|anywhere|distributed)\b/i;
export const looksRemote = (...parts: Array<string | null | undefined>) => parts.some((p) => p && REMOTE_RE.test(p));

const PERIOD_MULTIPLIER: Record<string, number> = { year: 1, yearly: 1, annual: 1, annum: 1, month: 12, monthly: 12, week: 52, weekly: 52, day: 260, daily: 260, hour: 2080, hourly: 2080 };

/** Convert a salary figure quoted per period into an annual figure. */
export function annualize(value: number | null | undefined, period?: string | null): number | null {
  if (!value || value <= 0) return null;
  const key = (period ?? "year").toLowerCase().replace(/^1\s*/, "").replace(/s$/, "");
  const mult = PERIOD_MULTIPLIER[key] ?? 1;
  return Math.round(value * mult);
}

const SALARY_MIN_PLAUSIBLE = 1_000;
const SALARY_MAX_PLAUSIBLE = 1_000_000_000; // also keeps values inside a 32-bit column

/**
 * Third-party salary data is messy (hourly rates labelled yearly, extra zeros, min > max).
 * Returns annual figures that are plausible and safe to store, or nulls.
 */
export function sanitizeSalary(min?: number | null, max?: number | null): { min: number | null; max: number | null } {
  const ok = (n?: number | null) => (typeof n === "number" && Number.isFinite(n) && n >= SALARY_MIN_PLAUSIBLE && n <= SALARY_MAX_PLAUSIBLE ? Math.round(n) : null);
  let lo = ok(min);
  let hi = ok(max);
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

const COUNTRY_NAMES: Record<string, string> = {
  india: "in", "united states": "us", usa: "us", "united kingdom": "gb", uk: "gb", germany: "de", canada: "ca",
  australia: "au", singapore: "sg", netherlands: "nl", france: "fr", ireland: "ie", "united arab emirates": "ae", uae: "ae",
};

export function countryFromText(text?: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) return code;
  }
  return null;
}

export function safeDate(value: unknown, fallback = new Date()): Date {
  if (value === null || value === undefined || value === "") return fallback;
  const d = typeof value === "number" ? new Date(value < 1e11 ? value * 1000 : value) : new Date(String(value));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function safeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  in: "INR", us: "USD", gb: "GBP", au: "AUD", ca: "CAD", sg: "SGD", de: "EUR", fr: "EUR", nl: "EUR", at: "EUR", es: "EUR", it: "EUR", pl: "PLN", za: "ZAR", nz: "NZD", br: "BRL", mx: "MXN",
};
