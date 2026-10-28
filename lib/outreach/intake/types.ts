import { z } from "zod";

/** A job extracted from a link or pasted text. Everything here is untrusted third-party data. */
export const extractedJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(150),
  location: z.string().trim().max(200).nullable().default(null),
  description: z.string().trim().min(1).max(20_000),
  requirements: z.array(z.string().trim().max(300)).max(30).default([]),
  sourceUrl: z.string().url().max(2000).nullable().default(null),
  applyUrl: z.string().url().max(2000).nullable().default(null),
  source: z.string().max(40).default("link"),
});
export type ExtractedJob = z.output<typeof extractedJobSchema>;

/** What the intake endpoint tells the UI. */
export type IntakeResult =
  | { status: "ok"; job: ExtractedJob }
  | {
      status: "needs_description";
      /** Why we could not read the posting (shown to the candidate). */
      reason: string;
      /** Whatever we did learn (for example the site) so the form can be pre-filled. */
      hint: { host: string | null };
    };

/** Output of the AI extraction step (before we attach URLs). */
export const aiExtractSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(150),
  location: z.string().trim().max(200).nullable().default(null),
  description: z.string().trim().min(1).max(20_000),
  requirements: z.array(z.string().trim().max(300)).max(30).default([]),
});
