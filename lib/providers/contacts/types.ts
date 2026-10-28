import type { TargetRole } from "@/generated/prisma/enums";

/** A person returned by a licensed contact-data provider. Only people that come from here can ever be contacted. */
export interface PersonCandidate {
  fullName: string;
  title: string;
  roleType: TargetRole;
  email: string | null;
  linkedinUrl: string | null;
  /** ISO-3166 alpha-2, lowercase; null when the provider does not know. */
  country: string | null;
  /** Provider record id, plus the evidence for a warm path (for example "school:BITS Pilani"). */
  sourceRef: string;
  /** 0..1, the provider's own confidence that this person and email are right. */
  confidence: number;
}

export interface PeopleQuery {
  companyName: string;
  /** Company web domain when known (resolves the email format and the right organisation). */
  domain: string | null;
  roles: TargetRole[];
  limit: number;
  /** Used only to find warm paths (same school / former employer); never sent as free text anywhere else. */
  candidateBackground: { schools: string[]; employers: string[] };
}

export interface PeopleResult {
  people: PersonCandidate[];
  /** Cost of this call in millionths of a US dollar (recorded in ProviderUsage). */
  costMicros: number;
}

/**
 * Licensed contact discovery. Implementations must source data lawfully (no scraping of LinkedIn or any site
 * that forbids it); ask each provider how its data is sourced before you choose one (spec decision 3).
 */
export interface ContactDataProvider {
  readonly name: string;
  searchPeople(query: PeopleQuery): Promise<PeopleResult>;
}
