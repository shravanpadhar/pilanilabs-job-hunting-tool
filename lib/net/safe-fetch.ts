import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { flags } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fixturePage } from "@/lib/net/fixtures";

/**
 * Fetching a URL the candidate pasted is an SSRF risk, so every hop is validated:
 *  - https only, default port only, no credentials in the URL;
 *  - the hostname must resolve ONLY to public addresses (no loopback, private, link-local, CGNAT, multicast, ULA);
 *  - redirects are followed manually (max 3) and each target is re-validated;
 *  - response size and time are capped; only text-like content types are accepted; no cookies are sent.
 */
const MAX_REDIRECTS = 3;

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    if (l === "::" || l === "::1") return true;
    if (l.startsWith("::ffff:")) return isPrivateAddress(l.slice(7)); // IPv4-mapped
    return /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith("ff"); // ULA, link-local, multicast
  }
  return true; // not an IP at all: treat as unsafe
}

export type Resolver = (hostname: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((r) => r.address);

export async function assertPublicHttpsUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError("That does not look like a valid link.", 400, "bad_url");
  }
  if (url.protocol !== "https:") throw new AppError("Only https:// links can be read.", 400, "bad_url");
  if (url.username || url.password) throw new AppError("Links with embedded credentials are not allowed.", 400, "bad_url");
  if (url.port && url.port !== "443") throw new AppError("Links with custom ports are not allowed.", 400, "bad_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new AppError("That link points to a private address and cannot be read.", 400, "private_url");
  }
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) throw new AppError("We could not find that website.", 400, "unresolvable_url");
  if (addresses.some(isPrivateAddress)) throw new AppError("That link points to a private address and cannot be read.", 400, "private_url");
  return url;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  resolver?: Resolver;
}

const TEXT_TYPES = /^(text\/|application\/(json|ld\+json|xhtml\+xml|xml))/i;

export async function safeFetchText(raw: string, opts: SafeFetchOptions = {}): Promise<{ url: string; contentType: string; text: string }> {
  const { maxBytes = 2_000_000, timeoutMs = 10_000, fetchImpl = fetch, resolver } = opts;
  if (flags.externalFakes) {
    try {
      const fx = fixturePage(new URL(raw));
      if (fx) return { url: raw, contentType: fx.contentType, text: fx.text };
    } catch {
      /* not a URL: fall through to normal validation */
    }
  }
  let current = await assertPublicHttpsUrl(raw, resolver);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(current, {
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9", "User-Agent": "PilanilabsJobTool/1.0 (job link reader)" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new AppError("The website redirected us nowhere.", 502, "bad_redirect");
      current = await assertPublicHttpsUrl(new URL(location, current).toString(), resolver); // re-validate every hop
      continue;
    }
    if (!res.ok) throw new AppError(`The website answered with an error (${res.status}).`, 502, "fetch_failed");
    const contentType = res.headers.get("content-type") ?? "";
    if (!TEXT_TYPES.test(contentType)) throw new AppError("That link is not a web page we can read.", 415, "unsupported_content");
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new AppError("That page is too large to read.", 413, "too_large");

    // Stream with a hard cap: never buffer an unbounded response.
    const reader = res.body?.getReader();
    if (!reader) return { url: current.toString(), contentType, text: await res.text().then((t) => t.slice(0, maxBytes)) };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError("That page is too large to read.", 413, "too_large");
      }
      chunks.push(value);
    }
    return { url: current.toString(), contentType, text: Buffer.concat(chunks).toString("utf8") };
  }
  throw new AppError("The link redirected too many times.", 502, "too_many_redirects");
}
