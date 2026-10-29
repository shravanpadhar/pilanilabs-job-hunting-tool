import { AppError } from "@/lib/errors";
import type { ContactDataProvider, PeopleQuery, PeopleResult } from "@/lib/providers/contacts/types";

/**
 * ╔════════════════════════════════════════════════════════════════════════════════════════╗
 * ║  ADAPTER STUB — NOT A REAL PROVIDER.                                                   ║
 * ║  Replace the body of `searchPeople` with calls to the licensed provider you choose     ║
 * ║  after the bake-off (spec decision 3). Requirements for any implementation:            ║
 * ║   - authenticate with CONTACT_DATA_API_KEY (server-side only, never logged);           ║
 * ║   - map the provider's people to PersonCandidate (roleType, confidence 0..1, country,  ║
 * ║     sourceRef = provider record id) and return the real per-call cost in costMicros;   ║
 * ║   - never scrape LinkedIn or any site that forbids it, and confirm in writing how the  ║
 * ║     provider sources its data;                                                         ║
 * ║   - treat everything the provider returns as untrusted data.                           ║
 * ╚════════════════════════════════════════════════════════════════════════════════════════╝
 */
export class LicensedContactProviderStub implements ContactDataProvider {
  readonly name = "licensed-stub";

  async searchPeople(_query: PeopleQuery): Promise<PeopleResult> {
    void _query;
    throw new AppError(
      "No licensed contact-data provider is connected yet. Pick one (see README, provider bake-off) and implement lib/providers/contacts/licensed-stub.ts, or set CONTACT_DATA_PROVIDER=fake for sample data.",
      501,
      "contact_provider_not_configured",
    );
  }
}
