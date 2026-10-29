import { env } from "@/lib/env";
import type { ExtractedJob } from "@/lib/outreach/intake/types";

/**
 * Looks a job up through a LICENSED job-search API. This is how LinkedIn and Indeed links are handled:
 * those pages are never fetched or scraped. When nothing is found the caller asks the candidate to paste the
 * job description instead.
 */
export interface JobLookupProvider {
  readonly name: string;
  lookup(input: { url: string; host: "linkedin" | "indeed" }): Promise<ExtractedJob | null>;
}

/** Fake: only resolves URLs that contain "fixture-job" (used by tests and the local demo); everything else is "not found". */
export class FakeJobLookup implements JobLookupProvider {
  readonly name = "fake";
  async lookup({ url }: { url: string; host: "linkedin" | "indeed" }): Promise<ExtractedJob | null> {
    if (!url.includes("fixture-job")) return null;
    return {
      title: "Senior Frontend Engineer",
      company: "Acme Labs",
      location: "Bengaluru, India",
      description: "Build and ship customer-facing React and TypeScript features.\n- 4+ years of React\n- Strong TypeScript\n- Experience with testing",
      requirements: ["4+ years of React", "Strong TypeScript", "Experience with testing"],
      sourceUrl: url,
      applyUrl: url,
      source: "licensed-lookup",
    };
  }
}

/**
 * ADAPTER STUB — implement with the licensed job API you choose (for example a Google-for-Jobs aggregator you are
 * licensed to use). Until then it returns null, which makes the UI ask the candidate to paste the description.
 */
export class LicensedJobLookupStub implements JobLookupProvider {
  readonly name = "licensed-stub";
  async lookup(): Promise<ExtractedJob | null> {
    return null;
  }
}

let override: JobLookupProvider | null = null;
export function setJobLookupForTests(p: JobLookupProvider | null) {
  override = p;
}

export function getJobLookup(): JobLookupProvider {
  if (override) return override;
  return env.jobLookupProvider === "licensed" ? new LicensedJobLookupStub() : new FakeJobLookup();
}
