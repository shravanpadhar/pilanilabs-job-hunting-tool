import { describe, expect, it } from "vitest";
import { completeness, computeDedupeHash, mergeDuplicates, normalizeCompany, normalizeLocation, normalizeTitle } from "@/lib/sources/dedupe";
import type { NormalizedJob } from "@/lib/sources/types";

const base: NormalizedJob = {
  source: "jsearch",
  externalId: "a",
  title: "Senior Backend Engineer",
  company: "Cobalt Payments Pvt. Ltd.",
  location: "Bangalore, Karnataka, India",
  isRemote: false,
  descriptionText: "Short.",
  postedAt: new Date("2026-10-10"),
  applyUrl: "https://example.com/a",
  isDirect: false,
};

describe("normalisation", () => {
  it("ignores case, punctuation and remote/hybrid noise in titles", () => {
    expect(normalizeTitle("Senior Backend Engineer (Remote)")).toBe(normalizeTitle("senior   backend engineer"));
  });
  it("strips corporate suffixes from company names", () => {
    expect(normalizeCompany("Cobalt Payments Pvt. Ltd.")).toBe(normalizeCompany("Cobalt Payments"));
    expect(normalizeCompany("Acme, Inc.")).toBe("acme");
  });
  it("maps Indian city aliases and uses only the first location segment", () => {
    expect(normalizeLocation("Bangalore, Karnataka", false)).toBe("bengaluru");
    expect(normalizeLocation("Gurgaon", false)).toBe("gurugram");
    expect(normalizeLocation(null, true)).toBe("remote");
  });
});

describe("dedupe hash", () => {
  it("is identical for the same job listed on two sources", () => {
    const a = computeDedupeHash(base);
    const other: NormalizedJob = { ...base, source: "adzuna", title: "Senior Backend Engineer ", company: "Cobalt Payments", location: "Bengaluru" };
    const b = computeDedupeHash(other);
    expect(a).toBe(b);
  });
  it("differs when title, company or city differ", () => {
    const a = computeDedupeHash(base);
    expect(computeDedupeHash({ ...base, title: "Junior Backend Engineer" })).not.toBe(a);
    expect(computeDedupeHash({ ...base, company: "Other Co" })).not.toBe(a);
    expect(computeDedupeHash({ ...base, location: "Pune" })).not.toBe(a);
  });
});

describe("mergeDuplicates", () => {
  it("keeps the most complete record, fills gaps and remembers every source", () => {
    const thin = { ...base, source: "adzuna", externalId: "b", location: "Bengaluru" };
    const rich: NormalizedJob = {
      ...base,
      source: "greenhouse",
      externalId: "c",
      location: "Bengaluru",
      descriptionText: "A very long description. ".repeat(80),
      salaryMin: 3000000,
      salaryMax: 4500000,
      salaryCurrency: "INR",
      isDirect: true,
      postedAt: new Date("2026-10-12"),
    };
    const merged = mergeDuplicates([thin, rich, { ...base, location: "Bengaluru" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("greenhouse");
    expect(merged[0].salaryMax).toBe(4500000);
    expect(merged[0].sourcesSeen.sort()).toEqual(["adzuna", "greenhouse", "jsearch"]);
    expect(merged[0].isDirect).toBe(true);
    expect(merged[0].postedAt).toEqual(new Date("2026-10-10")); // earliest sighting
  });

  it("completeness prefers direct, detailed, salaried records", () => {
    expect(completeness({ descriptionText: "x".repeat(2000), salaryMin: 1, isDirect: true })).toBeGreaterThan(completeness({ descriptionText: "x" }));
  });
});
