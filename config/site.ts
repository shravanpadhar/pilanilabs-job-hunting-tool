export const siteConfig = {
  name: "Pilanilabs",
  productName: "Pilanilabs Job Hunting Tool",
  tagline: "Upload your resume. Get matched to jobs posted this week.",
  description:
    "Upload your resume, get a ranked feed of fresh jobs from many sources, and generate a tailored resume for each application.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  parentSite: "https://www.pilanilabs.com",
  ogImage: "https://www.pilanilabs.com/manus-storage/og-image_c03f665d.png",
} as const;

/** Product-wide numeric knobs. */
export const limits = {
  maxResumeBytes: 5 * 1024 * 1024,
  defaultPostedWithinDays: 14,
  feedPageSize: 20,
} as const;
