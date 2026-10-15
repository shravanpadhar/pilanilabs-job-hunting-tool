/** Company name → URL slug. Must stay stable: job.companySlug and company pages depend on it. */
export function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(pvt\.?|private|ltd\.?|limited|inc\.?|incorporated|llc|llp|corp\.?|corporation|gmbh|co\.|technologies pvt)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
