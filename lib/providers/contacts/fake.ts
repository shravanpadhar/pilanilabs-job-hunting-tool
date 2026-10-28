import { createHash } from "node:crypto";
import type { TargetRole } from "@/generated/prisma/enums";
import type { ContactDataProvider, PeopleQuery, PeopleResult, PersonCandidate } from "@/lib/providers/contacts/types";

const FIRST = ["Aarav", "Meera", "Rohan", "Isha", "Kabir", "Nisha", "Vikram", "Tara", "Dev", "Anaya"];
const LAST = ["Kapoor", "Nair", "Menon", "Bose", "Iyer", "Rao", "Sethi", "Joshi", "Verma", "Das"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const seed = (s: string) => parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16);

/**
 * Deterministic sample contacts for local development and tests. Addresses use the reserved ".test" TLD, so
 * nothing can ever be delivered to a real mailbox. The same company always yields the same people.
 * Confidence is deliberately spread (0.95 down to 0.55) and one person has an unknown country, so the
 * gating, region and decision flows can all be exercised.
 */
export class FakeContactProvider implements ContactDataProvider {
  readonly name = "fake";

  async searchPeople(q: PeopleQuery): Promise<PeopleResult> {
    const base = slug(q.companyName) || "company";
    // Always a reserved .test domain, even when the real company domain is known: a fake must never be able to
    // produce an address that could be delivered to a real mailbox.
    const domain = `${base}.test`;
    const s = seed(base);
    const roles: Array<{ roleType: TargetRole; title: string; confidence: number; country: string | null }> = [
      { roleType: "HIRING_MANAGER", title: "Engineering Manager", confidence: 0.95, country: "in" },
      { roleType: "TEAM_LEAD", title: "Senior Team Lead", confidence: 0.88, country: "in" },
      { roleType: "RECRUITER", title: "Technical Recruiter", confidence: 0.82, country: "in" },
      { roleType: "RECRUITER", title: "Talent Acquisition Partner", confidence: 0.55, country: null },
      { roleType: "TEAM_LEAD", title: "Staff Engineer", confidence: 0.72, country: "gb" }, // region-blocked on purpose
    ];

    const people: PersonCandidate[] = roles
      .filter((r) => q.roles.includes(r.roleType))
      .map((r, i) => {
        const first = FIRST[(s + i * 3) % FIRST.length];
        const last = LAST[(s + i * 7) % LAST.length];
        return {
          fullName: `${first} ${last}`,
          title: r.title,
          roleType: r.roleType,
          email: `${first}.${last}@${domain}`.toLowerCase(),
          linkedinUrl: `https://www.linkedin.com/in/${slug(first)}-${slug(last)}-${(s + i) % 1000}`,
          country: r.country,
          sourceRef: `fake:${base}:${i}`,
          confidence: r.confidence,
        };
      });

    // A warm path exists only when the candidate really has a school to share (never invented).
    if (q.roles.includes("WARM_PATH") && q.candidateBackground.schools[0]) {
      const first = FIRST[(s + 11) % FIRST.length];
      const last = LAST[(s + 13) % LAST.length];
      people.push({
        fullName: `${first} ${last}`,
        title: "Product Manager",
        roleType: "WARM_PATH",
        email: `${first}.${last}@${domain}`.toLowerCase(),
        linkedinUrl: null,
        country: "in",
        sourceRef: `fake:${base}:warm|school:${q.candidateBackground.schools[0]}`,
        confidence: 0.8,
      });
    }
    return { people: people.slice(0, q.limit), costMicros: 20_000 * Math.max(1, Math.min(people.length, q.limit)) };
  }
}
