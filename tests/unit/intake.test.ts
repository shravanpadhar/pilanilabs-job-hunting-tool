import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { assertPublicHttpsUrl, isPrivateAddress, safeFetchText } from "@/lib/net/safe-fetch";
import { readAtsJob } from "@/lib/outreach/intake/ats";
import { classifyJobUrl, employerDomainFromUrl } from "@/lib/outreach/intake/classify";
import { intakeFromPaste, intakeFromUrl } from "@/lib/outreach/intake";
import { parseJobPostingJsonLd } from "@/lib/outreach/intake/jsonld";
import { FakeJobLookup } from "@/lib/providers/joblookup";

const publicResolver = async () => ["93.184.216.34"];

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertPublicHttpsUrl (SSRF guard)", () => {
  const bad = async (u: string, resolver = publicResolver) => {
    await expect(assertPublicHttpsUrl(u, resolver)).rejects.toBeInstanceOf(AppError);
  };
  it("rejects non-https, credentials, custom ports, localhost and internal names", async () => {
    await bad("http://example.com/job");
    await bad("ftp://example.com/job");
    await bad("https://user:pass@example.com/job");
    await bad("https://example.com:8443/job");
    await bad("https://localhost/job");
    await bad("https://app.localhost/job");
    await bad("https://metadata.internal/job");
    await bad("not a url");
  });
  it("rejects literal private IPs and hostnames that resolve to private addresses (DNS rebinding style)", async () => {
    await bad("https://169.254.169.254/latest/meta-data");
    await bad("https://[::1]/x");
    await bad("https://evil.example/job", async () => ["10.0.0.5"]);
    await bad("https://mixed.example/job", async () => ["93.184.216.34", "127.0.0.1"]); // any private answer is enough
    await bad("https://nxdomain.example/job", async () => []);
  });
  it("accepts a normal public https URL", async () => {
    await expect(assertPublicHttpsUrl("https://careers.acme.com/jobs/1", publicResolver)).resolves.toBeInstanceOf(URL);
  });
});

describe("safeFetchText", () => {
  const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });

  it("returns text for a public page", async () => {
    const fetchImpl = vi.fn(async () => html("<p>hello</p>")) as unknown as typeof fetch;
    const r = await safeFetchText("https://acme.com/x", { fetchImpl, resolver: publicResolver });
    expect(r.text).toBe("<p>hello</p>");
  });

  it("re-validates every redirect hop and refuses a redirect into a private address", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: "https://internal.acme.com/admin" } });
    }) as unknown as typeof fetch;
    const resolver = async (h: string) => (h === "internal.acme.com" ? ["10.0.0.9"] : ["93.184.216.34"]);
    await expect(safeFetchText("https://acme.com/x", { fetchImpl, resolver })).rejects.toThrow(/private/);
    expect(calls).toBe(1); // the private hop was never requested
  });

  it("gives up after too many redirects", async () => {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "https://acme.com/again" } })) as unknown as typeof fetch;
    await expect(safeFetchText("https://acme.com/x", { fetchImpl, resolver: publicResolver })).rejects.toThrow(/too many/);
  });

  it("refuses non-text content and oversized pages", async () => {
    const pdf = (async () => new Response("x", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    await expect(safeFetchText("https://acme.com/x", { fetchImpl: pdf, resolver: publicResolver })).rejects.toThrow(/not a web page/);
    const big = (async () => html("a".repeat(5000))) as unknown as typeof fetch;
    await expect(safeFetchText("https://acme.com/x", { fetchImpl: big, resolver: publicResolver, maxBytes: 1000 })).rejects.toThrow(/too large/);
    const declared = (async () => html("a", { "content-length": "999999" })) as unknown as typeof fetch;
    await expect(safeFetchText("https://acme.com/x", { fetchImpl: declared, resolver: publicResolver, maxBytes: 1000 })).rejects.toThrow(/too large/);
  });
});

describe("classifyJobUrl", () => {
  it("recognises the four ATS systems with their slug and id", () => {
    expect(classifyJobUrl("https://boards.greenhouse.io/acme/jobs/12345")).toEqual({ kind: "greenhouse", slug: "acme", jobId: "12345" });
    expect(classifyJobUrl("https://job-boards.greenhouse.io/acme/jobs/987?gh_src=x")).toEqual({ kind: "greenhouse", slug: "acme", jobId: "987" });
    expect(classifyJobUrl("https://jobs.lever.co/acme/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab")).toMatchObject({ kind: "lever", slug: "acme" });
    expect(classifyJobUrl("https://jobs.ashbyhq.com/acme/8f0e2d3c-aaaa-bbbb-cccc-1234567890ab")).toMatchObject({ kind: "ashby", slug: "acme" });
    expect(classifyJobUrl("https://apply.workable.com/acme/j/ABC123DEF4/")).toEqual({ kind: "workable", slug: "acme", shortcode: "ABC123DEF4" });
  });
  it("flags LinkedIn and Indeed, and treats lookalikes and junk as generic", () => {
    expect(classifyJobUrl("https://www.linkedin.com/jobs/view/123")).toEqual({ kind: "linkedin" });
    expect(classifyJobUrl("https://in.indeed.com/viewjob?jk=abc")).toEqual({ kind: "indeed" });
    expect(classifyJobUrl("https://linkedin.com.evil.example/jobs/1")).toEqual({ kind: "generic" });
    expect(classifyJobUrl("https://boards.greenhouse.io.evil.example/acme/jobs/1")).toEqual({ kind: "generic" });
    expect(classifyJobUrl("https://jobs.lever.co/..%2f..%2fx/1")).toEqual({ kind: "generic" });
    expect(classifyJobUrl("nonsense")).toEqual({ kind: "generic" });
  });
  it("derives an employer domain only from non-ATS hosts", () => {
    expect(employerDomainFromUrl("https://careers.acme.com/jobs/1")).toBe("acme.com");
    expect(employerDomainFromUrl("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
    expect(employerDomainFromUrl("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(employerDomainFromUrl(null)).toBeNull();
  });
});

describe("JSON-LD JobPosting", () => {
  const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>x</body></html>`;
  it("extracts a posting, including inside @graph, and converts HTML descriptions", () => {
    const job = parseJobPostingJsonLd(
      page({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, { "@type": "JobPosting", title: "Data Analyst", hiringOrganization: { name: "Acme" }, description: "<p>Analyse data.</p><ul><li>SQL</li></ul>", jobLocation: { address: { addressLocality: "Pune", addressCountry: "IN" } }, url: "https://acme.com/j/1" }] }),
      "https://acme.com/j/1",
    );
    expect(job).toMatchObject({ title: "Data Analyst", company: "Acme", location: "Pune, IN", source: "jsonld" });
    expect(job!.description).toContain("Analyse data.");
    expect(job!.description).not.toContain("<p>");
  });
  it("returns null without a usable posting or with broken JSON", () => {
    expect(parseJobPostingJsonLd("<html></html>", null)).toBeNull();
    expect(parseJobPostingJsonLd(`<script type="application/ld+json">{not json</script>`, null)).toBeNull();
    expect(parseJobPostingJsonLd(page({ "@type": "JobPosting", title: "No company" }), null)).toBeNull();
  });
});

describe("ATS readers", () => {
  it("reads a Greenhouse job from its public API", async () => {
    const getJson = vi.fn(async () => ({ title: "Backend Engineer", company_name: "Acme", location: { name: "Remote" }, absolute_url: "https://boards.greenhouse.io/acme/jobs/1", content: "&lt;p&gt;Build APIs.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;" })) as never;
    const job = await readAtsJob({ kind: "greenhouse", slug: "acme", jobId: "1" }, "https://boards.greenhouse.io/acme/jobs/1", getJson);
    expect(job).toMatchObject({ title: "Backend Engineer", company: "Acme", location: "Remote", source: "greenhouse" });
    expect(job!.description).toContain("Build APIs.");
    expect((getJson as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs/1");
  });
  it("finds the right posting in Ashby and Workable lists, and returns null when it is gone", async () => {
    const ashby = (async () => ({ jobs: [{ id: "other", title: "X", descriptionPlain: "x" }, { id: "j1", title: "Designer", location: "Remote", descriptionPlain: "Design things", jobUrl: "https://jobs.ashbyhq.com/acme/j1" }] })) as never;
    expect(await readAtsJob({ kind: "ashby", slug: "acme", jobId: "j1" }, "u", ashby)).toMatchObject({ title: "Designer", source: "ashby" });
    expect(await readAtsJob({ kind: "ashby", slug: "acme", jobId: "gone" }, "u", ashby)).toBeNull();
    const workable = (async () => ({ name: "Acme Inc", jobs: [{ shortcode: "ABC", title: "PM", description: "<p>Own the roadmap</p>", city: "Pune", country: "India" }] })) as never;
    expect(await readAtsJob({ kind: "workable", slug: "acme", shortcode: "ABC" }, "u", workable)).toMatchObject({ company: "Acme Inc", location: "Pune, India", source: "workable" });
  });
  it("reads a Lever posting including its lists", async () => {
    const lever = (async () => ({ text: "SRE", descriptionPlain: "Keep it up", lists: [{ text: "You will", content: "<li>Run on-call</li>" }], categories: { location: "Bengaluru" }, hostedUrl: "https://jobs.lever.co/acme/1" })) as never;
    const job = await readAtsJob({ kind: "lever", slug: "acme", jobId: "1" }, "u", lever);
    expect(job!.description).toContain("Run on-call");
    expect(job!.location).toBe("Bengaluru");
  });
});

describe("intakeFromUrl", () => {
  it("never fetches LinkedIn or Indeed pages: licensed lookup or ask the candidate to paste", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const miss = await intakeFromUrl("u1", "https://www.linkedin.com/jobs/view/123456", { fetchOptions: { fetchImpl, resolver: publicResolver }, lookup: new FakeJobLookup() });
    expect(miss.status).toBe("needs_description");
    const hit = await intakeFromUrl("u1", "https://www.linkedin.com/jobs/view/fixture-job-1", { fetchOptions: { fetchImpl, resolver: publicResolver }, lookup: new FakeJobLookup() });
    expect(hit).toMatchObject({ status: "ok", job: { company: "Acme Labs" } });
    const indeed = await intakeFromUrl("u1", "https://in.indeed.com/viewjob?jk=1", { fetchOptions: { fetchImpl, resolver: publicResolver }, lookup: new FakeJobLookup() });
    expect(indeed.status).toBe("needs_description");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses an ATS API when the link is a known career system", async () => {
    const getJson = (async () => ({ title: "QA Engineer", company_name: "Acme", content: "Test things", absolute_url: "https://boards.greenhouse.io/acme/jobs/9" })) as never;
    const r = await intakeFromUrl("u1", "https://boards.greenhouse.io/acme/jobs/9", { getJson });
    expect(r).toMatchObject({ status: "ok", job: { title: "QA Engineer", source: "greenhouse" } });
  });

  it("prefers structured JSON-LD from a generic page and falls back to AI text extraction otherwise", async () => {
    const ld = `<script type="application/ld+json">{"@type":"JobPosting","title":"Analyst","hiringOrganization":{"name":"Acme"},"description":"Analyse things carefully every day."}</script>`;
    const withLd = (async () => new Response(ld, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect(await intakeFromUrl("u1", "https://careers.acme.com/j/1", { fetchOptions: { fetchImpl: withLd, resolver: publicResolver } })).toMatchObject({ status: "ok", job: { source: "jsonld" } });

    const plain = (async () => new Response("<h1>Data Engineer at Acme</h1><p>Build pipelines.</p>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const extract = vi.fn(async (_u: string, text: string, url: string | null) => ({ title: "Data Engineer", company: "Acme", location: null, description: text, requirements: [], sourceUrl: url, applyUrl: url, source: "link" }));
    const r = await intakeFromUrl("u1", "https://careers.acme.com/j/2", { fetchOptions: { fetchImpl: plain, resolver: publicResolver }, extract });
    expect(r.status).toBe("ok");
    expect(extract.mock.calls[0][1]).toContain("Build pipelines.");
  });

  it("asks for a pasted description when the page cannot be read or has no posting", async () => {
    const boom = (async () => new Response("nope", { status: 500, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await intakeFromUrl("u1", "https://careers.acme.com/j/3", { fetchOptions: { fetchImpl: boom, resolver: publicResolver } })).status).toBe("needs_description");
    const none = (async () => new Response("<p>cookies</p>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await intakeFromUrl("u1", "https://careers.acme.com/j/4", { fetchOptions: { fetchImpl: none, resolver: publicResolver }, extract: async () => null })).status).toBe("needs_description");
  });

  it("refuses private addresses outright (an error, not a fallback)", async () => {
    await expect(intakeFromUrl("u1", "https://169.254.169.254/x")).rejects.toBeInstanceOf(AppError);
    await expect(intakeFromUrl("u1", "http://example.com/x")).rejects.toBeInstanceOf(AppError);
  });
});

describe("intakeFromPaste", () => {
  it("builds the job directly when title and company are given (no AI)", async () => {
    const extract = vi.fn();
    const r = await intakeFromPaste("u1", { title: "PM", company: "Acme", description: "Own the roadmap.\n- 3+ years in product\n- SQL and analytics skills" }, { extract });
    expect(r).toMatchObject({ status: "ok", job: { title: "PM", company: "Acme", source: "pasted", requirements: ["3+ years in product", "SQL and analytics skills"] } });
    expect(extract).not.toHaveBeenCalled();
  });
  it("uses extraction when title or company is missing, and says so when it cannot tell", async () => {
    const ok = await intakeFromPaste("u1", { description: "x".repeat(60) }, { extract: async () => ({ title: "T", company: "C", location: null, description: "d", requirements: [], sourceUrl: null, applyUrl: null, source: "link" }) });
    expect(ok.status).toBe("ok");
    expect((await intakeFromPaste("u1", { description: "x".repeat(60) }, { extract: async () => null })).status).toBe("needs_description");
  });
});
