/**
 * Fixture job pages for local development and end-to-end tests. They are only reachable when EXTERNAL_FAKES is on (which is
 * impossible in production) and only for hosts ending in ".fixture.test". The company name comes from the first host label,
 * so every test can use a fresh company and never trips the one-touch-per-company-per-30-days rule.
 *   https://northwind.fixture.test/jobs/1  ->  company "Northwind"
 */
export const FIXTURE_HOST_SUFFIX = ".fixture.test";

const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function fixturePage(url: URL): { contentType: string; text: string } | null {
  if (!url.hostname.endsWith(FIXTURE_HOST_SUFFIX)) return null;
  const company = titleCase(url.hostname.slice(0, -FIXTURE_HOST_SUFFIX.length).split(".")[0]);
  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Senior Frontend Engineer",
    hiringOrganization: { "@type": "Organization", name: company },
    jobLocation: { "@type": "Place", address: { addressLocality: "Bengaluru", addressCountry: "India" } },
    description: `<p>${company} is hiring a Senior Frontend Engineer to build customer-facing React and TypeScript features.</p><ul><li>4+ years of React</li><li>Strong TypeScript</li><li>Experience with testing</li></ul>`,
    url: url.toString(),
  };
  return { contentType: "text/html", text: `<html><head><title>${company} careers</title><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body><h1>Senior Frontend Engineer</h1></body></html>` };
}
