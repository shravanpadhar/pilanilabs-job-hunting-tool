/**
 * Curated company facts for company pages. This is public, high-level information
 * (HQ, founding year, funding *stage*) maintained by hand — it is NOT scraped from
 * Glassdoor, LinkedIn or Crunchbase (their terms forbid that). Funding stages are
 * deliberately coarse and can go out of date, so the UI shows "as of" and a
 * "verify on the company site" note. Add or correct entries freely.
 *
 * `slug` must equal slugify(name) from lib/companies/slug.ts.
 */
export interface CompanyProfileSeed {
  name: string;
  website: string;
  industry: string;
  hqLocation: string;
  foundedYear: number;
  fundingStage: string;
  description: string;
  sizeRange?: string;
}

export const PROFILES_AS_OF = "2026-01-01";
export const PROFILES_SOURCE = "Pilanilabs curated list (public information)";

export const COMPANY_PROFILE_SEEDS: CompanyProfileSeed[] = [
  { name: "Groww", website: "https://groww.in", industry: "Fintech", hqLocation: "Bengaluru, India", foundedYear: 2016, fundingStage: "Public", description: "Investment and wealth platform for stocks, mutual funds and other financial products in India." },
  { name: "slice", website: "https://www.sliceit.com", industry: "Fintech", hqLocation: "Bengaluru, India", foundedYear: 2016, fundingStage: "Venture-backed", description: "Indian fintech offering credit and banking products for young professionals." },
  { name: "Druva", website: "https://www.druva.com", industry: "Cloud data protection", hqLocation: "Pune, India / Sunnyvale, USA", foundedYear: 2008, fundingStage: "Late-stage venture", description: "SaaS data protection and cyber-resilience platform." },
  { name: "CRED", website: "https://cred.club", industry: "Fintech", hqLocation: "Bengaluru, India", foundedYear: 2018, fundingStage: "Late-stage venture", description: "Credit-card payments and rewards app for creditworthy Indian consumers." },
  { name: "Meesho", website: "https://meesho.com", industry: "E-commerce", hqLocation: "Bengaluru, India", foundedYear: 2015, fundingStage: "Late-stage / recently listed — verify", description: "Social commerce marketplace connecting small sellers with value-conscious shoppers across India." },
  { name: "Zeta", website: "https://www.zeta.tech", industry: "Fintech / banking technology", hqLocation: "Bengaluru, India / Sunnyvale, USA", foundedYear: 2015, fundingStage: "Late-stage venture", description: "Cloud-native card issuing and banking technology platform." },
  { name: "GitLab", website: "https://about.gitlab.com", industry: "DevOps software", hqLocation: "All-remote", foundedYear: 2011, fundingStage: "Public", description: "Single application for the DevSecOps lifecycle; one of the largest all-remote companies." },
  { name: "Stripe", website: "https://stripe.com", industry: "Payments infrastructure", hqLocation: "San Francisco, USA / Dublin, Ireland", foundedYear: 2010, fundingStage: "Late-stage private", description: "Payments and financial infrastructure for internet businesses." },
  { name: "Databricks", website: "https://www.databricks.com", industry: "Data & AI platform", hqLocation: "San Francisco, USA", foundedYear: 2013, fundingStage: "Late-stage private", description: "Lakehouse data and AI platform built on Apache Spark." },
  { name: "Cloudflare", website: "https://www.cloudflare.com", industry: "Network security & performance", hqLocation: "San Francisco, USA", foundedYear: 2009, fundingStage: "Public", description: "Global network providing CDN, security and edge computing services." },
  { name: "Figma", website: "https://www.figma.com", industry: "Design software", hqLocation: "San Francisco, USA", foundedYear: 2012, fundingStage: "Public", description: "Collaborative interface design and prototyping platform." },
  { name: "MongoDB", website: "https://www.mongodb.com", industry: "Database software", hqLocation: "New York, USA", foundedYear: 2007, fundingStage: "Public", description: "Developer data platform built around the MongoDB document database." },
  { name: "Elastic", website: "https://www.elastic.co", industry: "Search & observability", hqLocation: "Distributed (Mountain View, USA / Amsterdam)", foundedYear: 2012, fundingStage: "Public", description: "Company behind Elasticsearch, Kibana and the Elastic Stack." },
  { name: "Datadog", website: "https://www.datadoghq.com", industry: "Observability", hqLocation: "New York, USA", foundedYear: 2010, fundingStage: "Public", description: "Monitoring and security platform for cloud applications." },
  { name: "Twilio", website: "https://www.twilio.com", industry: "Communications APIs", hqLocation: "San Francisco, USA", foundedYear: 2008, fundingStage: "Public", description: "Cloud communications platform for messaging, voice and customer engagement." },
  { name: "Okta", website: "https://www.okta.com", industry: "Identity & access management", hqLocation: "San Francisco, USA", foundedYear: 2009, fundingStage: "Public", description: "Identity platform for workforce and customer authentication." },
  { name: "Samsara", website: "https://www.samsara.com", industry: "IoT / connected operations", hqLocation: "San Francisco, USA", foundedYear: 2015, fundingStage: "Public", description: "Connected operations cloud for physical operations such as fleets and equipment." },
  { name: "Vercel", website: "https://vercel.com", industry: "Developer cloud", hqLocation: "San Francisco, USA (remote-friendly)", foundedYear: 2015, fundingStage: "Venture-backed", description: "Frontend cloud platform and creator of Next.js." },
  { name: "Asana", website: "https://asana.com", industry: "Work management software", hqLocation: "San Francisco, USA", foundedYear: 2008, fundingStage: "Public", description: "Work management platform for teams." },
  { name: "Mixpanel", website: "https://mixpanel.com", industry: "Product analytics", hqLocation: "San Francisco, USA", foundedYear: 2009, fundingStage: "Venture-backed", description: "Product analytics for understanding user behaviour." },
  { name: "Fivetran", website: "https://www.fivetran.com", industry: "Data integration", hqLocation: "Oakland, USA", foundedYear: 2012, fundingStage: "Late-stage venture", description: "Automated data movement and pipeline platform." },
  { name: "Intercom", website: "https://www.intercom.com", industry: "Customer service software", hqLocation: "San Francisco, USA / Dublin, Ireland", foundedYear: 2011, fundingStage: "Late-stage venture", description: "AI-first customer service platform." },
  { name: "Coursera", website: "https://www.coursera.org", industry: "Online education", hqLocation: "Mountain View, USA", foundedYear: 2012, fundingStage: "Public", description: "Online learning platform offering courses, certificates and degrees." },
  { name: "Dropbox", website: "https://www.dropbox.com", industry: "Cloud storage & collaboration", hqLocation: "San Francisco, USA (remote-first)", foundedYear: 2007, fundingStage: "Public", description: "File storage, sync and collaboration software." },
  { name: "Airbnb", website: "https://www.airbnb.com", industry: "Travel marketplace", hqLocation: "San Francisco, USA", foundedYear: 2008, fundingStage: "Public", description: "Online marketplace for stays and experiences." },
  { name: "Discord", website: "https://discord.com", industry: "Communication platform", hqLocation: "San Francisco, USA", foundedYear: 2015, fundingStage: "Venture-backed", description: "Voice, video and text communication platform for communities." },
  { name: "PostHog", website: "https://posthog.com", industry: "Product analytics (open source)", hqLocation: "Remote-first (SF / London)", foundedYear: 2020, fundingStage: "Venture-backed", description: "Open-source product analytics suite." },
  { name: "Supabase", website: "https://supabase.com", industry: "Developer platform (open source)", hqLocation: "Remote-first", foundedYear: 2020, fundingStage: "Venture-backed", description: "Open-source Postgres development platform with auth, storage and realtime." },
  { name: "Plaid", website: "https://plaid.com", industry: "Fintech infrastructure", hqLocation: "San Francisco, USA", foundedYear: 2013, fundingStage: "Late-stage venture", description: "Network connecting apps to users' bank accounts." },
  { name: "Snyk", website: "https://snyk.io", industry: "Developer security", hqLocation: "Boston, USA / London, UK", foundedYear: 2015, fundingStage: "Late-stage venture", description: "Developer-first application security platform." },
  { name: "Sentry", website: "https://sentry.io", industry: "Application monitoring", hqLocation: "San Francisco, USA", foundedYear: 2012, fundingStage: "Venture-backed", description: "Error tracking and performance monitoring for developers." },
  { name: "Amplitude", website: "https://amplitude.com", industry: "Product analytics", hqLocation: "San Francisco, USA", foundedYear: 2012, fundingStage: "Public", description: "Digital analytics platform for product teams." },
];
