export type AtsProviderName = "greenhouse" | "lever" | "ashby";

export interface CompanyBoardConfig {
  provider: AtsProviderName;
  /** Board token / site name — the slug in the public job board URL. */
  slug: string;
  /** Display name used on jobs (also drives the company page slug). */
  name: string;
}

/**
 * Companies whose public ATS job boards are fetched directly ("Hidden jobs" feed).
 * Every slug below was checked against the live public API when this file was written.
 * Users can add more boards from the Hidden jobs page; they are stored in the CompanyBoard table.
 *
 *   Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
 *   Lever:      https://api.lever.co/v0/postings/{slug}?mode=json
 *   Ashby:      https://api.ashbyhq.com/posting-api/job-board/{slug}
 */
export const COMPANY_BOARDS: CompanyBoardConfig[] = [
  // India-based / India-hiring
  { provider: "greenhouse", slug: "groww", name: "Groww" },
  { provider: "greenhouse", slug: "slice", name: "slice" },
  { provider: "greenhouse", slug: "druva", name: "Druva" },
  { provider: "lever", slug: "cred", name: "CRED" },
  { provider: "lever", slug: "meesho", name: "Meesho" },
  { provider: "lever", slug: "zeta", name: "Zeta" },
  // Global companies with remote / India roles
  { provider: "greenhouse", slug: "gitlab", name: "GitLab" },
  { provider: "greenhouse", slug: "stripe", name: "Stripe" },
  { provider: "greenhouse", slug: "databricks", name: "Databricks" },
  { provider: "greenhouse", slug: "cloudflare", name: "Cloudflare" },
  { provider: "greenhouse", slug: "figma", name: "Figma" },
  { provider: "greenhouse", slug: "mongodb", name: "MongoDB" },
  { provider: "greenhouse", slug: "elastic", name: "Elastic" },
  { provider: "greenhouse", slug: "datadog", name: "Datadog" },
  { provider: "greenhouse", slug: "twilio", name: "Twilio" },
  { provider: "greenhouse", slug: "okta", name: "Okta" },
  { provider: "greenhouse", slug: "samsara", name: "Samsara" },
  { provider: "greenhouse", slug: "vercel", name: "Vercel" },
  { provider: "greenhouse", slug: "asana", name: "Asana" },
  { provider: "greenhouse", slug: "mixpanel", name: "Mixpanel" },
  { provider: "greenhouse", slug: "fivetran", name: "Fivetran" },
  { provider: "greenhouse", slug: "intercom", name: "Intercom" },
  { provider: "greenhouse", slug: "coursera", name: "Coursera" },
  { provider: "greenhouse", slug: "dropbox", name: "Dropbox" },
  { provider: "greenhouse", slug: "airbnb", name: "Airbnb" },
  { provider: "greenhouse", slug: "discord", name: "Discord" },
  { provider: "ashby", slug: "posthog", name: "PostHog" },
  { provider: "ashby", slug: "supabase", name: "Supabase" },
  { provider: "ashby", slug: "plaid", name: "Plaid" },
  { provider: "ashby", slug: "snyk", name: "Snyk" },
  { provider: "ashby", slug: "sentry", name: "Sentry" },
  { provider: "ashby", slug: "amplitude", name: "Amplitude" },
];

/** Sources that aggregate other portals (as opposed to direct company boards). */
export const AGGREGATOR_SOURCES = [
  "jsearch",
  "adzuna",
  "remotive",
  "remoteok",
  "arbeitnow",
  "jobicy",
] as const;

export const DIRECT_SOURCES = ["greenhouse", "lever", "ashby"] as const;
