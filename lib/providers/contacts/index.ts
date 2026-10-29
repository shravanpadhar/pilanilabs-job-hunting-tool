import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { FakeContactProvider } from "@/lib/providers/contacts/fake";
import { HunterContactProvider } from "@/lib/providers/contacts/hunter";
import type { ContactDataProvider } from "@/lib/providers/contacts/types";

let override: ContactDataProvider | null = null;

/** Tests may inject their own provider (pass null to reset). */
export function setContactProviderForTests(p: ContactDataProvider | null) {
  override = p;
}

export function getContactProvider(): ContactDataProvider {
  if (override) return override;
  if (env.contactDataProvider !== "licensed") return new FakeContactProvider();
  const key = env.contactDataApiKey;
  if (!key) throw new AppError("CONTACT_DATA_API_KEY is not set, so people cannot be found.", 501, "contact_provider_not_configured");
  // "licensed" currently means Hunter.io. To use another vendor, add its adapter and return it here.
  return new HunterContactProvider(key);
}

export type { ContactDataProvider };
