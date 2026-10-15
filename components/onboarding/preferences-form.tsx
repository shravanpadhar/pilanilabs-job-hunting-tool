"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, Label } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import type { PreferencesInput } from "@/lib/validation";

const LEVELS = [
  { value: "fresher", label: "Fresher (0–1 yr)" },
  { value: "junior", label: "Junior (1–3 yrs)" },
  { value: "mid", label: "Mid-level (3–6 yrs)" },
  { value: "senior", label: "Senior (6–10 yrs)" },
  { value: "lead", label: "Lead / Manager (10+ yrs)" },
];

const NOTICE = [
  { value: "", label: "Not specified" },
  { value: "0", label: "Immediate" },
  { value: "15", label: "15 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

export function PreferencesForm({ value, onChange, suggestedRoles = [] }: { value: PreferencesInput; onChange: (v: PreferencesInput) => void; suggestedRoles?: string[] }) {
  const set = <K extends keyof PreferencesInput>(k: K, v: PreferencesInput[K]) => onChange({ ...value, [k]: v });
  const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <div className="space-y-6">
      <Field label="Target roles" htmlFor="pref-roles" hint="Press Enter after each role. We match on these titles and close synonyms.">
        <TagInput id="pref-roles" value={value.targetRoles} onChange={(v) => set("targetRoles", v)} placeholder="e.g. Product Manager" suggestions={suggestedRoles} max={10} />
      </Field>

      <Field label="Locations" htmlFor="pref-locations" hint="Cities or countries you would work from. Leave empty for anywhere.">
        <TagInput id="pref-locations" value={value.locations} onChange={(v) => set("locations", v)} placeholder="e.g. Bengaluru, Pune, India" suggestions={["Bengaluru", "Hyderabad", "Pune", "Mumbai", "Delhi NCR", "Chennai"]} max={10} />
      </Field>

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">Work mode</legend>
        <div className="flex flex-wrap gap-x-5">
          {(["REMOTE", "HYBRID", "ONSITE"] as const).map((m) => (
            <Checkbox key={m} label={m === "REMOTE" ? "Remote" : m === "HYBRID" ? "Hybrid" : "On-site"} checked={value.workModes.includes(m)} onChange={() => set("workModes", toggle(value.workModes, m))} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Select none to see all work modes.</p>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">Job type</legend>
        <div className="flex flex-wrap gap-x-5">
          {(
            [
              ["FULL_TIME", "Full-time"],
              ["CONTRACT", "Contract"],
              ["INTERNSHIP", "Internship"],
              ["PART_TIME", "Part-time"],
            ] as const
          ).map(([v, label]) => (
            <Checkbox key={v} label={label} checked={value.jobTypes.includes(v)} onChange={() => set("jobTypes", toggle(value.jobTypes, v))} />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Experience level" htmlFor="pref-level">
          <Select id="pref-level" value={value.experienceLevel ?? ""} onChange={(e) => set("experienceLevel", (e.target.value || null) as PreferencesInput["experienceLevel"])}>
            <option value="">Not specified</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notice period" htmlFor="pref-notice">
          <Select id="pref-notice" value={value.noticePeriodDays === null ? "" : String(value.noticePeriodDays)} onChange={(e) => set("noticePeriodDays", e.target.value === "" ? null : Number(e.target.value))}>
            {NOTICE.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label="Minimum salary (per year)" htmlFor="pref-salary" hint="Jobs that state a lower maximum salary are hidden. Jobs with no salary are always shown.">
          <Input id="pref-salary" type="number" inputMode="numeric" min={0} step={10000} placeholder="e.g. 1200000" value={value.minSalary ?? ""} onChange={(e) => set("minSalary", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
        </Field>
        <div className="space-y-1.5">
          <Label htmlFor="pref-currency">Currency</Label>
          <Select id="pref-currency" value={value.currency} onChange={(e) => set("currency", e.target.value as PreferencesInput["currency"])}>
            {["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Must-have keywords" htmlFor="pref-include" hint="Jobs containing these rank higher.">
          <TagInput id="pref-include" value={value.keywordsInclude} onChange={(v) => set("keywordsInclude", v)} placeholder="e.g. fintech" max={15} />
        </Field>
        <Field label="Exclude keywords" htmlFor="pref-exclude" hint="Jobs containing these are hidden.">
          <TagInput id="pref-exclude" value={value.keywordsExclude} onChange={(v) => set("keywordsExclude", v)} placeholder="e.g. unpaid" max={15} />
        </Field>
      </div>
    </div>
  );
}

export const DEFAULT_PREFERENCES: PreferencesInput = {
  targetRoles: [],
  locations: [],
  workModes: [],
  minSalary: null,
  currency: "INR",
  experienceLevel: null,
  jobTypes: ["FULL_TIME"],
  keywordsInclude: [],
  keywordsExclude: [],
  noticePeriodDays: null,
};
