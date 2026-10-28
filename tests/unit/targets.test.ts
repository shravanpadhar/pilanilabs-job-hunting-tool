import { describe, expect, it } from "vitest";
import { BLOCKED_COUNTRIES, isBlockedCountry, normalizeCountry, timeZoneForCountry } from "@/config/regions";
import { companyTypeOf } from "@/lib/outreach/company";
import { rankCandidates, targetGate } from "@/lib/outreach/targets";
import { FakeContactProvider } from "@/lib/providers/contacts/fake";
import { FakeEmailVerifier } from "@/lib/providers/verify";

describe("region policy", () => {
  it("blocks EU27, EEA, UK and Switzerland, allows everything else", () => {
    for (const c of ["de", "fr", "ie", "no", "is", "li", "gb", "uk", "GB", "ch", "se", "pl"]) expect(isBlockedCountry(c), c).toBe(true);
    for (const c of ["in", "us", "ca", "sg", "ae", "au", "br"]) expect(isBlockedCountry(c), c).toBe(false);
    expect(BLOCKED_COUNTRIES.size).toBe(27 + 3 + 2);
  });
  it("treats an unknown country as not blocked but unknown, and normalises codes", () => {
    expect(isBlockedCountry(null)).toBe(false);
    expect(normalizeCountry("UK")).toBe("gb");
    expect(normalizeCountry("India")).toBeNull();
    expect(timeZoneForCountry("in", "UTC")).toBe("Asia/Kolkata");
    expect(timeZoneForCountry(null, "Asia/Dubai")).toBe("Asia/Dubai");
  });
});

describe("ranking", () => {
  it("orders hiring manager > team lead > recruiter > warm path, then confidence, deterministically", () => {
    const list = [
      { fullName: "W", roleType: "WARM_PATH" as const, confidence: 0.99 },
      { fullName: "R1", roleType: "RECRUITER" as const, confidence: 0.6 },
      { fullName: "T", roleType: "TEAM_LEAD" as const, confidence: 0.5 },
      { fullName: "H", roleType: "HIRING_MANAGER" as const, confidence: 0.4 },
      { fullName: "R2", roleType: "RECRUITER" as const, confidence: 0.9 },
    ];
    expect(rankCandidates(list).map((p) => p.fullName)).toEqual(["H", "T", "R2", "R1", "W"]);
    expect(rankCandidates([...list].reverse()).map((p) => p.fullName)).toEqual(["H", "T", "R2", "R1", "W"]);
  });
});

describe("targetGate", () => {
  const ok = { email: "a@x.test", emailVerification: "VALID" as const, confidence: 0.9, country: "in", riskAcknowledgedAt: null };
  it("lets a verified, confident, allowed-region contact through", () => {
    expect(targetGate(ok)).toEqual({ hardBlocks: [], needsDecision: [], canProceed: true });
  });
  it("shows but does not allow weak contacts until the candidate decides", () => {
    for (const [patch, reason] of [[{ confidence: 0.5 }, "LOW_CONFIDENCE"], [{ emailVerification: "RISKY" as const }, "RISKY_EMAIL"], [{ emailVerification: "UNKNOWN" as const }, "UNVERIFIED_EMAIL"], [{ country: null }, "UNKNOWN_COUNTRY"], [{ email: null }, "NO_EMAIL"]] as const) {
      const g = targetGate({ ...ok, ...patch });
      expect(g.needsDecision, reason).toContain(reason);
      expect(g.canProceed, reason).toBe(false);
      expect(targetGate({ ...ok, ...patch, riskAcknowledgedAt: new Date() }).canProceed, `${reason} after decision`).toBe(true);
    }
  });
  it("hard blocks can never be overridden by a decision", () => {
    for (const patch of [{ emailVerification: "INVALID" as const }, { country: "de" }, { suppressed: true }]) {
      const g = targetGate({ ...ok, ...patch, riskAcknowledgedAt: new Date() });
      expect(g.hardBlocks.length).toBe(1);
      expect(g.canProceed).toBe(false);
    }
  });
});

describe("company type", () => {
  it("buckets by size and funding", () => {
    expect(companyTypeOf(null)).toBe("unknown");
    expect(companyTypeOf({ sizeRange: "10,000+", fundingStage: "Public" })).toBe("enterprise");
    expect(companyTypeOf({ sizeRange: "11-50", fundingStage: "Seed" })).toBe("startup");
    expect(companyTypeOf({ sizeRange: "500-1000", fundingStage: "Series C" })).toBe("scaleup");
  });
});

describe("fake providers", () => {
  it("fake contacts are deterministic, use the reserved .test domain and only offer a warm path when a school exists", async () => {
    const p = new FakeContactProvider();
    const q = { companyName: "Acme Labs", domain: null, roles: ["HIRING_MANAGER", "TEAM_LEAD", "RECRUITER", "WARM_PATH"] as never, limit: 12, candidateBackground: { schools: [], employers: [] } };
    const a = await p.searchPeople(q);
    expect(a).toEqual(await p.searchPeople(q));
    expect(a.people.every((x) => x.email?.endsWith(".test"))).toBe(true);
    expect(a.people.some((x) => x.roleType === "WARM_PATH")).toBe(false);
    const warm = await p.searchPeople({ ...q, candidateBackground: { schools: ["BITS Pilani"], employers: [] } });
    expect(warm.people.find((x) => x.roleType === "WARM_PATH")?.sourceRef).toContain("school:BITS Pilani");
    expect(a.people.some((x) => x.country === "gb")).toBe(true); // exercises the region filter
  });
  it("fake verifier is deterministic", async () => {
    const v = new FakeEmailVerifier();
    expect((await v.verify("someone.invalid@x.test")).result).toBe("INVALID");
    expect((await v.verify("a.risky@x.test")).result).toBe("RISKY");
    expect((await v.verify("a.unknown@x.test")).result).toBe("UNKNOWN");
    expect(await v.verify("ok.person@x.test")).toEqual(await v.verify("ok.person@x.test"));
  });
});
