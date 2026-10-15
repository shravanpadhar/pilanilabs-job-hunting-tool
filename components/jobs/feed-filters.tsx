"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { JobFilters } from "@/lib/jobs/filters";

const SOURCES = [
  ["jsearch", "JSearch (Google for Jobs)"],
  ["adzuna", "Adzuna"],
  ["remotive", "Remotive"],
  ["remoteok", "RemoteOK"],
  ["arbeitnow", "Arbeitnow"],
  ["jobicy", "Jobicy"],
  ["greenhouse", "Greenhouse"],
  ["lever", "Lever"],
  ["ashby", "Ashby"],
];

/** A plain GET form: the server re-renders the feed. JS only adds auto-submit on change and the mobile toggle. */
export function FeedFilters({ action, filters, showMatchFilters = true, children }: { action: string; filters: JobFilters; showMatchFilters?: boolean; children?: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const submit = () => formRef.current?.requestSubmit();
  const sel = (name: string, label: string, value: string | number | undefined, options: Array<[string, string]>) => (
    <div className="space-y-1">
      <Label htmlFor={`f-${name}`} className="text-xs text-muted-foreground">{label}</Label>
      <Select id={`f-${name}`} name={name} defaultValue={value === undefined ? "" : String(value)} onChange={submit} className="h-10">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </div>
  );

  return (
    <form ref={formRef} action={action} method="get" role="search" aria-label="Filter jobs" className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="Search title, company or skill" aria-label="Search jobs" className="pl-10" />
        </div>
        <Button type="submit">Search</Button>
        <Button type="button" variant="outline" className="lg:hidden" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal /> <span className="sr-only sm:not-sr-only">Filters</span>
        </Button>
      </div>

      <div id={panelId} className={`${open ? "grid" : "hidden"} gap-3 rounded-card border bg-card p-4 sm:grid-cols-2 lg:grid lg:grid-cols-4`}>
        {sel("postedWithin", "Posted within", filters.postedWithin, [["", "Last 14 days"], ["1", "24 hours"], ["3", "3 days"], ["7", "7 days"], ["30", "30 days"]])}
        {sel("workMode", "Work mode", filters.workMode, [["", "Any"], ["remote", "Remote"], ["onsite", "On-site / hybrid"]])}
        {sel("sort", "Sort by", filters.sort, showMatchFilters ? [["", "Best match"], ["newest", "Newest"], ["salary", "Highest salary"]] : [["", "Newest"], ["salary", "Highest salary"]])}
        {showMatchFilters ? sel("minScore", "Min match score", filters.minScore, [["", "Any"], ["50", "50+"], ["60", "60+"], ["70", "70+"], ["80", "80+"], ["90", "90+"]]) : null}
        {sel("source", "Source", filters.source, [["", "All sources"], ...(SOURCES as Array<[string, string]>)])}
        {sel("employmentType", "Job type", filters.employmentType, [["", "Any"], ["FULL_TIME", "Full-time"], ["CONTRACT", "Contract"], ["INTERNSHIP", "Internship"], ["PART_TIME", "Part-time"]])}
        <div className="space-y-1">
          <Label htmlFor="f-location" className="text-xs text-muted-foreground">Location</Label>
          <Input id="f-location" name="location" defaultValue={filters.location} placeholder="e.g. Pune" className="h-10" onBlur={submit} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-minSalary" className="text-xs text-muted-foreground">Min salary (per year)</Label>
          <Input id="f-minSalary" name="minSalary" type="number" inputMode="numeric" min={0} step={10000} defaultValue={filters.minSalary} placeholder="Any" className="h-10" onBlur={submit} />
        </div>
      </div>
      {children}
    </form>
  );
}
