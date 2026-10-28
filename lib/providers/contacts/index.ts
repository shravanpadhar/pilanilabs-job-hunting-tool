import { env } from "@/lib/env";
import { FakeContactProvider } from "@/lib/providers/contacts/fake";
import { LicensedContactProviderStub } from "@/lib/providers/contacts/licensed-stub";
import type { ContactDataProvider } from "@/lib/providers/contacts/types";

let override: ContactDataProvider | null = null;

/** Tests may inject their own provider (pass null to reset). */
export function setContactProviderForTests(p: ContactDataProvider | null) {
  override = p;
}

export function getContactProvider(): ContactDataProvider {
  if (override) return override;
  return env.contactDataProvider === "licensed" ? new LicensedContactProviderStub() : new FakeContactProvider();
}

export type { ContactDataProvider };
