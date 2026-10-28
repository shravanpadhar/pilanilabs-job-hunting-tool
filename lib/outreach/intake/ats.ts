import { fetchJson } from "@/lib/http";
import { prettifySlug } from "@/lib/sources/board-url";
import { cleanHtml, decodeEscapedHtml, htmlToPlain, safeUrl } from "@/lib/sources/normalize";
import type { UrlKind } from "@/lib/outreach/intake/classify";
import type { ExtractedJob } from "@/lib/outreach/intake/types";

/**
 * Read ONE job from a company's public career-system API. These are official, keyless, documented endpoints
 * (Greenhouse Job Board, Lever Postings, Ashby Job Posting, Workable widget); hosts are fixed and the slug and id
 * were validated by classifyJobUrl, so there is no way to steer these requests elsewhere.
 * `getJson` is injectable for tests.
 */
type GetJson = <T>(url: string) => Promise<T>;
const defaultGet: GetJson = (url) => fetchJson(url, { timeoutMs: 20_000 });

const bullets = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, "")).slice(0, 20);

function finish(base: Omit<ExtractedJob, "requirements" | "description"> & { description: string }): ExtractedJob {
  const description = base.description.slice(0, 20_000);
  return { ...base, description, requirements: bullets(description) };
}

export async function readAtsJob(kind: Extract<UrlKind, { slug: string }>, sourceUrl: string, getJson: GetJson = defaultGet): Promise<ExtractedJob | null> {
  switch (kind.kind) {
    case "greenhouse": {
      const j = await getJson<{ title?: string; absolute_url?: string; content?: string; company_name?: string; location?: { name?: string } }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(kind.slug)}/jobs/${encodeURIComponent(kind.jobId)}`,
      );
      if (!j?.title || !j.content) return null;
      return finish({
        title: j.title.trim(), company: j.company_name?.trim() || prettifySlug(kind.slug), location: j.location?.name?.trim() || null,
        description: htmlToPlain(cleanHtml(decodeEscapedHtml(j.content))), sourceUrl, applyUrl: safeUrl(j.absolute_url) ?? sourceUrl, source: "greenhouse",
      });
    }
    case "lever": {
      const p = await getJson<{ text?: string; hostedUrl?: string; applyUrl?: string; descriptionPlain?: string; additionalPlain?: string; lists?: Array<{ text: string; content: string }>; categories?: { location?: string } }>(
        `https://api.lever.co/v0/postings/${encodeURIComponent(kind.slug)}/${encodeURIComponent(kind.jobId)}`,
      );
      if (!p?.text) return null;
      const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToPlain(`<ul>${l.content}</ul>`)}`).join("\n\n");
      const description = [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n");
      if (!description) return null;
      return finish({ title: p.text.trim(), company: prettifySlug(kind.slug), location: p.categories?.location ?? null, description, sourceUrl, applyUrl: safeUrl(p.applyUrl) ?? safeUrl(p.hostedUrl) ?? sourceUrl, source: "lever" });
    }
    case "ashby": {
      const data = await getJson<{ jobs?: Array<{ id: string; title?: string; location?: string; jobUrl?: string; applyUrl?: string; descriptionHtml?: string; descriptionPlain?: string }> }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(kind.slug)}`,
      );
      const j = data?.jobs?.find((x) => x.id === kind.jobId);
      if (!j?.title) return null;
      const description = j.descriptionHtml ? htmlToPlain(cleanHtml(j.descriptionHtml)) : (j.descriptionPlain ?? "");
      if (!description) return null;
      return finish({ title: j.title.trim(), company: prettifySlug(kind.slug), location: j.location ?? null, description, sourceUrl, applyUrl: safeUrl(j.jobUrl) ?? safeUrl(j.applyUrl) ?? sourceUrl, source: "ashby" });
    }
    case "workable": {
      const data = await getJson<{ name?: string; jobs?: Array<{ shortcode?: string; title?: string; url?: string; application_url?: string; description?: string; city?: string; country?: string }> }>(
        `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(kind.slug)}?details=true`,
      );
      const j = data?.jobs?.find((x) => x.shortcode === kind.shortcode);
      if (!j?.title || !j.description) return null;
      return finish({
        title: j.title.trim(), company: data.name?.trim() || prettifySlug(kind.slug), location: [j.city, j.country].filter(Boolean).join(", ") || null,
        description: htmlToPlain(cleanHtml(j.description)), sourceUrl, applyUrl: safeUrl(j.application_url) ?? safeUrl(j.url) ?? sourceUrl, source: "workable",
      });
    }
  }
}
