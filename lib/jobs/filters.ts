import { z } from "zod";

/** Feed / saved-search filters. Serialised in URLs and stored as JSON on SavedSearch. */
export const filtersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  workMode: z.enum(["any", "remote", "onsite"]).optional(),
  postedWithin: z.coerce.number().int().refine((n) => [1, 3, 7, 14, 30].includes(n)).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  minSalary: z.coerce.number().int().min(0).optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]).optional(),
  source: z.string().trim().max(40).optional(),
  sort: z.enum(["match", "newest", "salary"]).optional(),
});

export type JobFilters = z.infer<typeof filtersSchema>;

const KEYS = ["q", "location", "workMode", "postedWithin", "minScore", "minSalary", "employmentType", "source", "sort"] as const;

/** Parse filters from URLSearchParams / a Next.js searchParams object; unknown or invalid keys are dropped. */
export function parseFilters(input: URLSearchParams | Record<string, string | string[] | undefined>): JobFilters {
  const get = (k: string): string | undefined => {
    const v = input instanceof URLSearchParams ? input.get(k) : input[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() !== "" && s !== "any" ? s : undefined;
  };
  const raw: Record<string, string | undefined> = {};
  for (const k of KEYS) raw[k] = get(k);
  const result: Record<string, unknown> = {};
  for (const k of KEYS) {
    if (raw[k] === undefined) continue;
    const single = filtersSchema.pick({ [k]: true } as never).safeParse({ [k]: raw[k] });
    if (single.success) Object.assign(result, single.data);
  }
  return result as JobFilters;
}

export function filtersToSearchParams(f: JobFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of KEYS) {
    const v = f[k];
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  return sp;
}

export function describeFilters(f: JobFilters): string {
  const parts: string[] = [];
  if (f.q) parts.push(`“${f.q}”`);
  if (f.location) parts.push(`in ${f.location}`);
  if (f.workMode === "remote") parts.push("remote");
  if (f.workMode === "onsite") parts.push("on-site");
  if (f.postedWithin) parts.push(`posted in last ${f.postedWithin}d`);
  if (f.minScore) parts.push(`match ≥ ${f.minScore}`);
  if (f.minSalary) parts.push(`salary ≥ ${f.minSalary.toLocaleString("en-IN")}`);
  if (f.employmentType) parts.push(f.employmentType.replace("_", " ").toLowerCase());
  if (f.source) parts.push(`via ${f.source}`);
  return parts.join(" · ") || "All jobs";
}
