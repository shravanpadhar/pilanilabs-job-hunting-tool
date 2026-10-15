import { describe, expect, it } from "vitest";
import { parseBoardUrl } from "@/lib/sources/board-url";
import { sanitizeSalary, annualize, cleanHtml, countryFromText, decodeEscapedHtml, htmlToPlain, looksRemote, mapEmploymentType, safeUrl } from "@/lib/sources/normalize";
import { slugifyCompany } from "@/lib/companies/slug";

describe("career-page URL parsing", () => {
  it("recognises Greenhouse, Lever and Ashby boards", () => {
    expect(parseBoardUrl("https://boards.greenhouse.io/acme")).toEqual({ provider: "greenhouse", slug: "acme" });
    expect(parseBoardUrl("https://job-boards.greenhouse.io/acme/jobs/123")).toEqual({ provider: "greenhouse", slug: "acme" });
    expect(parseBoardUrl("jobs.lever.co/Acme-Inc")).toEqual({ provider: "lever", slug: "acme-inc" });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/acme/abc-123")).toEqual({ provider: "ashby", slug: "acme" });
    expect(parseBoardUrl("lever:acme")).toEqual({ provider: "lever", slug: "acme" });
  });
  it("rejects other hosts and malformed slugs (no SSRF through the slug)", () => {
    expect(parseBoardUrl("https://evil.example.com/acme")).toBeNull();
    expect(parseBoardUrl("https://jobs.lever.co/")).toBeNull();
    expect(parseBoardUrl("lever:../../etc/passwd")).toBeNull();
    expect(parseBoardUrl("not a url at all")).toBeNull();
  });
});

describe("normalisation helpers", () => {
  it("annualises salaries quoted per month / hour", () => {
    expect(annualize(100000, "MONTH")).toBe(1_200_000);
    expect(annualize(50, "HOUR")).toBe(104_000);
    expect(annualize(1_000_000, "1 YEAR")).toBe(1_000_000);
    expect(annualize(0, "YEAR")).toBeNull();
  });
  it("sanitises implausible salaries so they fit the database", () => {
    expect(sanitizeSalary(5_000_000_000, 6_000_000_000)).toEqual({ min: null, max: null });
    expect(sanitizeSalary(50, 90)).toEqual({ min: null, max: null }); // hourly rates mislabelled as yearly
    expect(sanitizeSalary(2_000_000, 1_000_000)).toEqual({ min: 1_000_000, max: 2_000_000 });
    expect(sanitizeSalary(null, 1_500_000)).toEqual({ min: null, max: 1_500_000 });
  });
  it("maps employment types", () => {
    expect(mapEmploymentType("FULLTIME")).toBe("FULL_TIME");
    expect(mapEmploymentType(["Contractor"])).toBe("CONTRACT");
    expect(mapEmploymentType("INTERN")).toBe("INTERNSHIP");
    expect(mapEmploymentType("Part Time")).toBe("PART_TIME");
    expect(mapEmploymentType("something else")).toBeNull();
  });
  it("detects remote work and countries", () => {
    expect(looksRemote("Work from home - India")).toBe(true);
    expect(looksRemote("Pune, Maharashtra")).toBe(false);
    expect(countryFromText("Bengaluru, India")).toBe("in");
    expect(countryFromText("Remote - USA")).toBe("us");
  });
  it("decodes Greenhouse's escaped HTML and sanitises it", () => {
    const decoded = decodeEscapedHtml("&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;");
    expect(decoded).toBe("<p>Build &amp; ship</p>");
    expect(htmlToPlain(decoded)).toBe("Build & ship");
    expect(cleanHtml('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>')).not.toMatch(/script|onclick|javascript:/);
  });
  it("only accepts http(s) URLs", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
  it("slugifies company names stably", () => {
    expect(slugifyCompany("Cobalt Payments Pvt. Ltd.")).toBe("cobalt-payments");
    expect(slugifyCompany("GitLab")).toBe("gitlab");
    expect(slugifyCompany("Ben & Jerry's")).toBe("ben-and-jerry-s");
  });
});
