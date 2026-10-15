import { describe, expect, it } from "vitest";
import { buildProfiles, EMPTY_PREFERENCES } from "@/lib/matching/profile";
import { remoteEligible, requiredYears, scoreStage1, type Stage1Job, type Stage1Profile } from "@/lib/matching/stage1";
import { extractSkills } from "@/lib/matching/text";
import { sampleResume } from "./fixtures";

const profile = (over: Partial<Stage1Profile> = {}): Stage1Profile => ({
  ...buildProfiles("r1", sampleResume, { ...EMPTY_PREFERENCES, targetRoles: ["Frontend Engineer"], locations: ["Bengaluru"] }).stage1,
  ...over,
});

const job = (over: Partial<Stage1Job> = {}): Stage1Job => {
  const description = over.descriptionText ?? "We need React, TypeScript and Next.js skills. 3+ years of experience.";
  const title = over.title ?? "Frontend Engineer";
  return {
    id: "j1",
    title,
    location: "Bengaluru, India",
    country: "in",
    isRemote: false,
    employmentType: "FULL_TIME",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    descriptionText: description,
    skills: extractSkills(`${title}\n${description}`),
    ...over,
  };
};

describe("skill extraction", () => {
  it("finds canonical skills and aliases", () => {
    const skills = extractSkills("Experience with ReactJS, Node, k8s and Postgres. Also C++ and CI/CD.");
    expect(skills).toEqual(expect.arrayContaining(["react", "node.js", "kubernetes", "postgresql", "c++", "ci/cd"]));
  });
  it("does not match skills inside other words", () => {
    expect(extractSkills("javascripting and reactionary views")).not.toContain("react");
    expect(extractSkills("We use Go, Python, SQL.")).toContain("go");
    expect(extractSkills("Ready to go the extra mile")).not.toContain("go");
  });
});

describe("stage 1 scoring", () => {
  it("ranks a strong match above a weak one", () => {
    const p = profile();
    const strong = scoreStage1(p, job())!;
    const weak = scoreStage1(p, job({ title: "Warehouse Supervisor", descriptionText: "Manage the warehouse floor in Bengaluru. Supply chain and logistics.", skills: ["supply chain", "logistics"] }));
    expect(strong.score).toBeGreaterThanOrEqual(75);
    expect(weak === null || weak.score < strong.score - 25).toBe(true);
    expect(strong.matchingSkills).toEqual(expect.arrayContaining(["react", "typescript"]));
  });

  it("reports missing skills and experience fit", () => {
    const r = scoreStage1(profile(), job({ descriptionText: "React, GraphQL and Kubernetes. 6+ years of experience required.", skills: ["react", "graphql", "kubernetes"] }))!;
    expect(r.missingSkills).toEqual(expect.arrayContaining(["graphql", "kubernetes"]));
    expect(r.experienceFit).toBe("under");
  });

  it("hard filters: location, remote-only, job type, salary, exclusions, experience gap", () => {
    expect(scoreStage1(profile(), job({ location: "Chennai, India" }))).toBeNull();
    expect(scoreStage1(profile({ workModes: ["REMOTE"] }), job())).toBeNull();
    expect(scoreStage1(profile({ jobTypes: ["INTERNSHIP"] }), job())).toBeNull();
    expect(scoreStage1(profile({ minSalary: 5_000_000, currency: "INR" }), job({ salaryMax: 3_000_000, salaryCurrency: "INR" }))).toBeNull();
    expect(scoreStage1(profile({ minSalary: 5_000_000, currency: "INR" }), job({ salaryMax: null }))).not.toBeNull(); // unknown salary is kept
    expect(scoreStage1(profile({ keywordsExclude: ["unpaid"] }), job({ descriptionText: "React role, unpaid trial period" }))).toBeNull();
    expect(scoreStage1(profile(), job({ descriptionText: "React. 12+ years of experience.", title: "Principal Frontend Engineer" }))).toBeNull();
  });

  it("remote jobs fit remote-only seekers but respect country restrictions", () => {
    const p = profile({ workModes: ["REMOTE"], locations: [] });
    expect(scoreStage1(p, job({ isRemote: true, location: "Worldwide" }))).not.toBeNull();
    expect(scoreStage1(p, job({ isRemote: true, location: "USA Only" }))).toBeNull();
    expect(scoreStage1(p, job({ isRemote: true, location: "APAC" }))).not.toBeNull();
  });

  it("must-have keywords add a bonus", () => {
    const j = job({ title: "Software Engineer", descriptionText: "React, GraphQL, Kubernetes and Kafka for a fintech product.", skills: ["react", "graphql", "kubernetes", "kafka"] });
    expect(scoreStage1(profile({ keywordsInclude: ["fintech"] }), j)!.score).toBeGreaterThan(scoreStage1(profile(), j)!.score);
  });
});

describe("helpers", () => {
  it("parses required years", () => {
    expect(requiredYears("Minimum 5 years of experience")).toBe(5);
    expect(requiredYears("3-5 years experience in sales")).toBe(3);
    expect(requiredYears("2+ years of relevant experience")).toBe(2);
    expect(requiredYears("no requirement")).toBeNull();
  });
  it("remoteEligible", () => {
    expect(remoteEligible(null, ["in"])).toBe(true);
    expect(remoteEligible("Remote - India", ["in"])).toBe(true);
    expect(remoteEligible("Europe only", ["in"])).toBe(false);
    expect(remoteEligible("Worldwide", ["in"])).toBe(true);
    expect(remoteEligible("Bielefeld", ["in"])).toBe(false); // remote within an unrecognised foreign place
    expect(remoteEligible("Remote", ["in"])).toBe(true);
    expect(remoteEligible("Pune", ["in"])).toBe(true);
  });
});
