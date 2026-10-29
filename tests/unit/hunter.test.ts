import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { classifyRole, cleanDomain, HunterContactProvider } from "@/lib/providers/contacts/hunter";
import { HunterEmailVerifier, mapHunterStatus } from "@/lib/providers/verify/hunter";

const KEY = "test-key-not-real";
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
/** A fetch stand-in that answers with the given responses in order and records every call. */
function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra call");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl: fn as unknown as typeof fetch, calls };
}

const person = (over: Record<string, unknown> = {}) => ({
  value: "asha.rao@acme.com", confidence: 91, first_name: "Asha", last_name: "Rao", position: "Engineering Manager",
  linkedin: "https://www.linkedin.com/in/asha-rao", ...over,
});
const query = (over: Record<string, unknown> = {}) => ({
  companyName: "Acme", domain: "acme.com", roles: ["HIRING_MANAGER", "TEAM_LEAD", "RECRUITER", "WARM_PATH"] as const,
  limit: 12, candidateBackground: { schools: ["BITS Pilani"], employers: [] }, ...over,
});

describe("role and domain helpers", () => {
  it("maps job titles to our roles and skips what it cannot place", () => {
    expect(classifyRole("Senior Technical Recruiter")).toBe("RECRUITER");
    expect(classifyRole("Head of Talent Acquisition")).toBe("RECRUITER");
    expect(classifyRole("HR Manager")).toBe("RECRUITER");
    expect(classifyRole("Engineering Manager")).toBe("HIRING_MANAGER");
    expect(classifyRole("Director of Engineering")).toBe("HIRING_MANAGER");
    expect(classifyRole("Staff Software Engineer")).toBe("TEAM_LEAD");
    expect(classifyRole("Tech Lead")).toBe("TEAM_LEAD");
    expect(classifyRole("Software Engineer")).toBeNull();
    expect(classifyRole(null)).toBeNull();
  });
  it("reduces a website to a bare domain", () => {
    expect(cleanDomain("https://www.Acme.com/careers?x=1")).toBe("acme.com");
    expect(cleanDomain("acme.co.in")).toBe("acme.co.in");
    expect(cleanDomain("not a domain")).toBeNull();
    expect(cleanDomain("")).toBeNull();
    expect(cleanDomain(null)).toBeNull();
  });
});

describe("HunterContactProvider", () => {
  it("sends the key in a header, never in the URL, and maps people", async () => {
    const { fetchImpl, calls } = fakeFetch(reply(200, { data: { country: "US", emails: [person(), person({ value: "ravi@acme.com", first_name: "Ravi", last_name: "N", position: "Technical Recruiter", linkedin: "ravi-n" })] } }));
    const out = await new HunterContactProvider(KEY, fetchImpl).searchPeople({ ...query(), roles: [...query().roles] });
    expect(calls[0].url).toContain("https://api.hunter.io/v2/domain-search");
    expect(calls[0].url).toContain("domain=acme.com");
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].headers["X-API-KEY"]).toBe(KEY);
    expect(out.people).toHaveLength(2);
    expect(out.people[0]).toMatchObject({
      fullName: "Asha Rao", title: "Engineering Manager", roleType: "HIRING_MANAGER", email: "asha.rao@acme.com",
      linkedinUrl: "https://www.linkedin.com/in/asha-rao", confidence: 0.91, country: null,
    });
    expect(out.people[0].sourceRef).toMatch(/^hunter:acme\.com:[0-9a-f]{12}$/);
    expect(out.people[1]).toMatchObject({ roleType: "RECRUITER", linkedinUrl: null }); // a bare handle is not a profile link
    expect(out.costMicros).toBeGreaterThan(0);
  });

  it("falls back to the company name when no domain is known", async () => {
    const { fetchImpl, calls } = fakeFetch(reply(200, { data: { emails: [] } }));
    const out = await new HunterContactProvider(KEY, fetchImpl).searchPeople({ ...query({ domain: null }), roles: [...query().roles] });
    expect(calls[0].url).toContain("company=Acme");
    expect(calls[0].url).not.toContain("domain=");
    expect(out).toEqual({ people: [], costMicros: 0 }); // nothing found costs nothing
  });

  it("never invents a warm path, and skips people it cannot name or place", async () => {
    const { fetchImpl } = fakeFetch(
      reply(200, { data: { emails: [person(), person({ value: "a@acme.com", first_name: null }), person({ value: "b@acme.com", position: "Designer" }), person({ value: "asha.rao@acme.com" })] } }),
    );
    const out = await new HunterContactProvider(KEY, fetchImpl).searchPeople({ ...query({ roles: ["WARM_PATH"] }), roles: ["WARM_PATH"] });
    expect(out.people).toEqual([]);
    const { fetchImpl: again } = fakeFetch(
      reply(200, { data: { emails: [person(), person({ value: "a@acme.com", first_name: null }), person({ value: "b@acme.com", position: "Designer" }), person({ value: "ASHA.RAO@acme.com" })] } }),
    );
    const all = await new HunterContactProvider(KEY, again).searchPeople({ ...query(), roles: [...query().roles] });
    expect(all.people.map((p) => p.email)).toEqual(["asha.rao@acme.com"]); // duplicate, nameless and untitled entries dropped
  });

  it("passes on the company country only when it is an excluded region", async () => {
    const eu = fakeFetch(reply(200, { data: { country: "DE", emails: [person()] } }));
    expect((await new HunterContactProvider(KEY, eu.fetchImpl).searchPeople({ ...query(), roles: [...query().roles] })).people[0].country).toBe("de");
    const uk = fakeFetch(reply(200, { data: { country: "GB", emails: [person()] } }));
    expect((await new HunterContactProvider(KEY, uk.fetchImpl).searchPeople({ ...query(), roles: [...query().roles] })).people[0].country).toBe("gb");
    const india = fakeFetch(reply(200, { data: { country: "IN", emails: [person()] } }));
    expect((await new HunterContactProvider(KEY, india.fetchImpl).searchPeople({ ...query(), roles: [...query().roles] })).people[0].country).toBeNull();
  });

  it("clamps confidence, honours the limit and treats a missing confidence as middling", async () => {
    const many = Array.from({ length: 5 }, (_, i) => person({ value: `p${i}@acme.com`, confidence: i === 0 ? 250 : i === 1 ? null : 40 }));
    const { fetchImpl } = fakeFetch(reply(200, { data: { emails: many } }));
    const out = await new HunterContactProvider(KEY, fetchImpl).searchPeople({ ...query({ limit: 2 }), roles: [...query().roles] });
    expect(out.people.map((p) => p.confidence)).toEqual([1, 0.5]);
  });

  it("treats a rejected domain as no people, and reports setup and outage problems clearly", async () => {
    const bad = fakeFetch(reply(400, { errors: [{ id: "wrong_params" }] }));
    expect(await new HunterContactProvider(KEY, bad.fetchImpl).searchPeople({ ...query(), roles: [...query().roles] })).toEqual({ people: [], costMicros: 0 });

    for (const [status, code] of [[401, "provider_auth"], [429, "provider_quota"], [403, "provider_quota"], [500, "provider_error"]] as const) {
      const f = fakeFetch(reply(status, { errors: [] }));
      await expect(new HunterContactProvider(KEY, f.fetchImpl).searchPeople({ ...query(), roles: [...query().roles] })).rejects.toMatchObject({ code });
    }
  });

  it("rejects an answer of the wrong shape without leaking the key", async () => {
    const f = fakeFetch(reply(200, { data: { emails: "nope" } }));
    const err = await new HunterContactProvider(KEY, f.fetchImpl).searchPeople({ ...query(), roles: [...query().roles] }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("provider_bad_response");
    expect(err.message).not.toContain(KEY);
  });
});

describe("HunterEmailVerifier", () => {
  const noWait = async () => {};
  const verifier = (...responses: Array<Response | Error>) => {
    const f = fakeFetch(...responses);
    return { v: new HunterEmailVerifier(KEY, f.fetchImpl, noWait), ...f };
  };

  it("maps Hunter statuses to ours", () => {
    expect(mapHunterStatus("valid")).toBe("VALID");
    expect(mapHunterStatus("invalid")).toBe("INVALID");
    expect(mapHunterStatus("disposable")).toBe("INVALID");
    expect(mapHunterStatus("accept_all")).toBe("RISKY");
    expect(mapHunterStatus("webmail")).toBe("RISKY");
    expect(mapHunterStatus("unknown")).toBe("UNKNOWN");
    expect(mapHunterStatus("something-new")).toBe("UNKNOWN");
  });

  it("verifies an address with the key in a header", async () => {
    const { v, calls } = verifier(reply(200, { data: { status: "valid" } }));
    const out = await v.verify(" Asha.Rao@Acme.com ");
    expect(out.result).toBe("VALID");
    expect(out.costMicros).toBeGreaterThan(0);
    expect(calls[0].url).toContain("https://api.hunter.io/v2/email-verifier");
    expect(calls[0].url).toContain("email=asha.rao%40acme.com");
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].headers["X-API-KEY"]).toBe(KEY);
  });

  it("asks again while Hunter is still checking (202), then gives up as UNKNOWN", async () => {
    const ok = verifier(reply(202, {}), reply(200, { data: { status: "accept_all" } }));
    expect((await ok.v.verify("a@acme.com")).result).toBe("RISKY");
    expect(ok.calls).toHaveLength(2);

    const stuck = verifier(reply(202, {}), reply(202, {}), reply(202, {}));
    expect(await stuck.v.verify("a@acme.com")).toEqual({ result: "UNKNOWN", costMicros: 0 });
    expect(stuck.calls).toHaveLength(3);
  });

  it("returns UNKNOWN for a temporary problem and a bad answer, but stops loudly on a wrong key", async () => {
    for (const r of [reply(429, {}), reply(500, {}), reply(200, { data: {} }), new Error("network down")]) {
      expect(await verifier(r).v.verify("a@acme.com")).toEqual({ result: "UNKNOWN", costMicros: 0 });
    }
    await expect(verifier(reply(401, {})).v.verify("a@acme.com")).rejects.toMatchObject({ code: "provider_auth" });
  });
});
