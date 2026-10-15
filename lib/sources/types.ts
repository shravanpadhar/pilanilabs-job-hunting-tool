import type { JobType } from "@/generated/prisma/enums";

export interface JobQuery {
  /** Free-text keywords / role, e.g. "react developer". */
  keywords: string;
  /** City / region text, e.g. "Bengaluru". */
  location?: string;
  /** ISO-3166 alpha-2, lowercase. Defaults to "in". */
  country?: string;
  remoteOnly?: boolean;
  postedWithinDays: number;
}

/** The single shape every connector maps into. */
export interface NormalizedJob {
  source: string;
  externalId: string;
  title: string;
  company: string;
  companyLogoUrl?: string | null;
  location?: string | null;
  country?: string | null;
  isRemote: boolean;
  employmentType?: JobType | null;
  /** Annual figures. */
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  descriptionHtml?: string | null;
  descriptionText: string;
  postedAt: Date;
  applyUrl: string;
  /** Original publisher when an aggregator reports it (e.g. "LinkedIn"). */
  publisher?: string | null;
  /** Link back required by the source's terms (Remotive, RemoteOK, Jobicy, Adzuna). */
  attributionUrl?: string | null;
  /** true for jobs read straight from a company's own ATS board. */
  isDirect: boolean;
}

export interface JobSourceConnector {
  name: string;
  /** false when an API key is missing. */
  isEnabled(): boolean;
  /**
   * "search" connectors are called once per query (they filter server-side).
   * "feed" connectors return a general recent-jobs feed and are called once per run.
   */
  mode: "search" | "feed";
  fetchJobs(query: JobQuery): Promise<NormalizedJob[]>;
}
