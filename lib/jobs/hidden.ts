import { AGGREGATOR_SOURCES } from "@/config/companies";

/** A "hidden" job is listed only on the company's own ATS board — never on an aggregator we read. */
export function isHiddenJob(job: { isDirect: boolean; sourcesSeen: string[] }): boolean {
  return job.isDirect && !job.sourcesSeen.some((s) => (AGGREGATOR_SOURCES as readonly string[]).includes(s));
}
