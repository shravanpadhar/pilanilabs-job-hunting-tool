/**
 * Region policy (spec section 8; D-13). EU, EEA, UK and Switzerland recipients are excluded by default until
 * a lawful-basis review is done. Countries are ISO-3166 alpha-2, lowercase.
 */
const EU27 = ["at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "de", "gr", "hu", "ie", "it", "lv", "lt", "lu", "mt", "nl", "pl", "pt", "ro", "sk", "si", "es", "se"];
const EEA_EXTRA = ["is", "li", "no"];
const UK_CH = ["gb", "ch"];

export const BLOCKED_COUNTRIES: ReadonlySet<string> = new Set([...EU27, ...EEA_EXTRA, ...UK_CH]);

export function normalizeCountry(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toLowerCase();
  if (c === "uk") return "gb";
  return /^[a-z]{2}$/.test(c) ? c : null;
}

export function isBlockedCountry(code: string | null | undefined): boolean {
  const c = normalizeCountry(code);
  return c !== null && BLOCKED_COUNTRIES.has(c);
}

/** Representative IANA time zone per country, used for the recipient's working hours (D-13). */
const COUNTRY_TZ: Record<string, string> = {
  in: "Asia/Kolkata", us: "America/New_York", ca: "America/Toronto", au: "Australia/Sydney", sg: "Asia/Singapore",
  ae: "Asia/Dubai", jp: "Asia/Tokyo", br: "America/Sao_Paulo", za: "Africa/Johannesburg", mx: "America/Mexico_City",
  gb: "Europe/London", de: "Europe/Berlin", fr: "Europe/Paris", nl: "Europe/Amsterdam", ie: "Europe/Dublin",
};

/** Falls back to the candidate's own zone when the recipient's country is unknown. */
export function timeZoneForCountry(code: string | null | undefined, fallback: string): string {
  const c = normalizeCountry(code);
  return (c && COUNTRY_TZ[c]) || fallback;
}
