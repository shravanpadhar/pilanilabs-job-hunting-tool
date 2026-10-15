import { describe, expect, it } from "vitest";
import { isDue } from "@/lib/alerts/run";
import { renderDigestEmail, renderDigestWhatsapp, type DigestJob } from "@/lib/alerts/render";
import { describeFilters, filtersToSearchParams, parseFilters } from "@/lib/jobs/filters";
import { isHiddenJob } from "@/lib/jobs/hidden";
import { formatSalary, sourceLabel, timeAgo } from "@/lib/format";
import { safeNext } from "@/lib/safe-redirect";
import { linkedinSearchLinks } from "@/lib/ai/referral-labels";
import { alertSettingsSchema, preferencesSchema } from "@/lib/validation";

describe("filters", () => {
  it("round-trips and drops invalid values", () => {
    const f = parseFilters(new URLSearchParams("q=react&workMode=remote&postedWithin=3&minScore=70&sort=newest&postedWithin2=9&bogus=1"));
    expect(f).toEqual({ q: "react", workMode: "remote", postedWithin: 3, minScore: 70, sort: "newest" });
    expect(parseFilters(new URLSearchParams("postedWithin=5&minScore=500&workMode=moon"))).toEqual({});
    expect(filtersToSearchParams(f).toString()).toContain("q=react");
    expect(describeFilters(f)).toContain("remote");
    expect(describeFilters({})).toBe("All jobs");
  });
});

describe("hidden jobs", () => {
  it("is hidden only when listed solely on direct company boards", () => {
    expect(isHiddenJob({ isDirect: true, sourcesSeen: ["greenhouse"] })).toBe(true);
    expect(isHiddenJob({ isDirect: true, sourcesSeen: ["greenhouse", "jsearch"] })).toBe(false);
    expect(isHiddenJob({ isDirect: false, sourcesSeen: ["remotive"] })).toBe(false);
  });
});

describe("alert scheduling", () => {
  const monday = new Date("2026-10-12T04:00:00Z"); // a Monday
  const wednesday = new Date("2026-10-14T04:00:00Z");
  it("daily fires once per ~day", () => {
    expect(isDue("DAILY", null, wednesday)).toBe(true);
    expect(isDue("DAILY", new Date("2026-10-14T03:30:00Z"), wednesday)).toBe(false);
    expect(isDue("DAILY", new Date("2026-10-13T03:30:00Z"), wednesday)).toBe(true);
    expect(isDue("OFF", null, wednesday)).toBe(false);
  });
  it("weekly fires on Mondays (or when overdue)", () => {
    expect(isDue("WEEKLY", new Date("2026-10-05T03:30:00Z"), monday)).toBe(true);
    expect(isDue("WEEKLY", new Date("2026-10-12T03:30:00Z"), monday)).toBe(false);
    expect(isDue("WEEKLY", new Date("2026-10-10T03:30:00Z"), wednesday)).toBe(false);
    expect(isDue("WEEKLY", new Date("2026-10-01T03:30:00Z"), wednesday)).toBe(true);
  });
  it("renders digests safely", () => {
    const job: DigestJob = { id: "j1", title: "<b>Dev</b> & co", company: "Acme", location: "Pune", isRemote: false, salaryMin: null, salaryMax: null, salaryCurrency: null, postedAt: new Date(), source: "jsearch", publisher: "LinkedIn", score: 88, reason: "Strong match" };
    const { html, text } = renderDigestEmail({ title: "Test", jobs: [job] });
    expect(html).not.toContain("<b>Dev</b>");
    expect(html).toContain("&lt;b&gt;Dev");
    expect(html).toContain("88% match");
    expect(text).toContain("/jobs/j1");
    expect(renderDigestWhatsapp({ title: "Test", jobs: [job] })).toContain("*<b>Dev</b> & co*");
  });
});

describe("validation", () => {
  it("normalises preferences", () => {
    const p = preferencesSchema.parse({ targetRoles: ["  PM  "], minSalary: 1000000 });
    expect(p.targetRoles).toEqual(["PM"]);
    expect(p.currency).toBe("INR");
    expect(() => preferencesSchema.parse({ workModes: ["MARS"] })).toThrow();
  });
  it("requires E.164 WhatsApp numbers", () => {
    const base = { alertFrequency: "DAILY", alertEmail: true, alertWhatsapp: true, alertMinScore: 70 };
    expect(alertSettingsSchema.safeParse({ ...base, whatsappNumber: "+919876543210" }).success).toBe(true);
    expect(alertSettingsSchema.safeParse({ ...base, whatsappNumber: "9876543210" }).success).toBe(false);
    expect(alertSettingsSchema.parse({ ...base, whatsappNumber: "" }).whatsappNumber).toBeNull();
  });
  it("only allows same-site redirects", () => {
    expect(safeNext("/jobs?x=1")).toBe("/jobs?x=1");
    expect(safeNext("//evil.com")).toBe("/jobs");
    expect(safeNext("https://evil.com")).toBe("/jobs");
    expect(safeNext("/\\evil.com")).toBe("/jobs");
    expect(safeNext(null, "/onboarding")).toBe("/onboarding");
  });
});

describe("formatting", () => {
  it("formats salaries", () => {
    expect(formatSalary(1_200_000, 2_500_000, "INR")).toBe("₹12 L – ₹25 L");
    expect(formatSalary(null, 90_000, "USD")).toBe("$90k");
    expect(formatSalary(null, null, "USD")).toBeNull();
  });
  it("labels sources honestly", () => {
    expect(sourceLabel("jsearch", "LinkedIn")).toBe("via JSearch · originally on LinkedIn");
    expect(sourceLabel("greenhouse", "Greenhouse")).toBe("via Greenhouse");
  });
  it("timeAgo", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(timeAgo(new Date("2026-10-15T11:30:00Z"), now)).toBe("30m ago");
    expect(timeAgo(new Date("2026-10-13T12:00:00Z"), now)).toBe("2 days ago");
  });
  it("builds LinkedIn search links without any automation", () => {
    const l = linkedinSearchLinks("Acme & Sons", "Engineer");
    expect(l.employees).toBe("https://www.linkedin.com/search/results/people/?keywords=Acme%20%26%20Sons");
  });
});
