/** Pure (client-safe) referral helpers — no server imports here. */
export const RELATIONSHIPS = ["cold", "alumni", "former_colleague", "mutual_connection", "same_community"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  cold: "I don't know them (cold outreach)",
  alumni: "We went to the same college / university",
  former_colleague: "We worked together before",
  mutual_connection: "We have a mutual connection",
  same_community: "Same community / group / event",
};

/** Build LinkedIn people-search URLs the user opens themselves. Nothing is scraped or automated. */
export function linkedinSearchLinks(company: string, role?: string | null) {
  const q = (s: string) => encodeURIComponent(s);
  return {
    employees: `https://www.linkedin.com/search/results/people/?keywords=${q(company)}`,
    sameTeam: `https://www.linkedin.com/search/results/people/?keywords=${q(`${company} ${role ?? ""}`.trim())}`,
    recruiters: `https://www.linkedin.com/search/results/people/?keywords=${q(`${company} recruiter talent acquisition`)}`,
    company: `https://www.linkedin.com/search/results/companies/?keywords=${q(company)}`,
  };
}
