import { createHash } from "node:crypto";
import { z } from "zod";
import { isBlockedCountry, normalizeCountry } from "@/config/regions";
import type { TargetRole } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { ContactDataProvider, PeopleQuery, PeopleResult, PersonCandidate } from "@/lib/providers/contacts/types";
import { HUNTER_CREDIT_COST_MICROS, hunterError, hunterGet, type FetchLike } from "@/lib/providers/hunter/client";

/** Hunter's free plan caps a domain search at 10 addresses, so ask for 10 on every plan (one credit per call). */
const SEARCH_LIMIT = 10;

// Everything the provider returns is untrusted data: validate the shape before using any of it.
const personSchema = z.object({
  value: z.string(),
  confidence: z.number().nullish(), // 0..100
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  position: z.string().nullish(),
  linkedin: z.string().nullish(),
});
const responseSchema = z.object({
  data: z.object({
    country: z.string().nullish(), // the company's country, not the person's
    emails: z.array(personSchema).nullish(),
  }),
});

/** Hunter gives a job title, not our role types. Unknown titles map to null and are skipped rather than guessed. */
export function classifyRole(position: string | null | undefined): TargetRole | null {
  const p = (position ?? "").toLowerCase();
  if (!p) return null;
  if (/recruit|talent|sourc|human resources|\bhr\b|people (ops|operations|partner|team)|staffing|acquisition/.test(p)) return "RECRUITER";
  if (/\b(head of|director|vp|vice president|chief|cto|ceo|coo|founder|co-founder|manager)\b/.test(p)) return "HIRING_MANAGER";
  if (/\b(lead|principal|staff|architect)\b/.test(p)) return "TEAM_LEAD";
  return null;
}

/** "https://www.acme.com/careers" -> "acme.com"; null when it does not look like a domain. */
export function cleanDomain(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let host = raw;
  try {
    host = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** Only a full linkedin.com profile URL is kept; anything else (a bare handle, a different site) is dropped. */
function profileUrl(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s]+$/i.test(s) ? s : null;
}

/**
 * Contact discovery through Hunter.io's domain search (a licensed email-finder database). One credit per search.
 *  - It never returns WARM_PATH people: Hunter holds no school or former-employer data, so a warm path could not be evidenced.
 *  - Hunter's country is the company's, so it is passed through only when it is an excluded region (EU/UK/EEA/CH, which
 *    blocks the person). Otherwise the person's country stays unknown and the candidate decides, as the rules require.
 */
export class HunterContactProvider implements ContactDataProvider {
  readonly name = "hunter";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async searchPeople(q: PeopleQuery): Promise<PeopleResult> {
    const domain = cleanDomain(q.domain);
    const params: Record<string, string | number> = { type: "personal", limit: SEARCH_LIMIT };
    if (domain) params.domain = domain;
    else if (q.companyName.trim()) params.company = q.companyName.trim();
    else return { people: [], costMicros: 0 };

    const { status, body } = await hunterGet("/domain-search", params, this.apiKey, this.fetchImpl);
    if (status === 400) {
      // Hunter rejects a domain or company it cannot use. That is "no people found", not an outage.
      log.warn("hunter_search_rejected", { feature: "contacts" });
      return { people: [], costMicros: 0 };
    }
    if (status !== 200) throw hunterError(status);

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new AppError("The contact-data provider sent an answer we could not read.", 502, "provider_bad_response");

    const orgCountry = normalizeCountry(parsed.data.data.country);
    const country = orgCountry && isBlockedCountry(orgCountry) ? orgCountry : null;
    const wanted = new Set<TargetRole>(q.roles);

    const seen = new Set<string>();
    const people: PersonCandidate[] = [];
    for (const e of parsed.data.data.emails ?? []) {
      const email = e.value.trim().toLowerCase();
      const first = (e.first_name ?? "").trim();
      const last = (e.last_name ?? "").trim();
      const roleType = classifyRole(e.position);
      if (!email || !first || !last || !roleType || !wanted.has(roleType) || seen.has(email)) continue;
      seen.add(email);
      people.push({
        fullName: `${first} ${last}`.slice(0, 120),
        title: (e.position ?? "").trim().slice(0, 160),
        roleType,
        email,
        linkedinUrl: profileUrl(e.linkedin),
        country,
        sourceRef: `hunter:${email.split("@")[1] ?? "unknown"}:${createHash("sha1").update(email).digest("hex").slice(0, 12)}`,
        confidence: Math.max(0, Math.min(1, (e.confidence ?? 50) / 100)),
      });
    }

    const hadResults = (parsed.data.data.emails ?? []).length > 0;
    return { people: people.slice(0, q.limit), costMicros: hadResults ? HUNTER_CREDIT_COST_MICROS : 0 };
  }
}
