import { AppError } from "@/lib/errors";

const BASE = "https://api.hunter.io/v2";

/** The global fetch, or a stand-in in tests. */
export type FetchLike = typeof fetch;

/**
 * Rough cost of one Hunter credit in millionths of a US dollar. Hunter bills in plan credits, not dollars, so this is
 * an estimate that only feeds our own per-user cost ceiling and margin tracking (ProviderUsage). Check it against your plan.
 */
export const HUNTER_CREDIT_COST_MICROS = 80_000;

export interface HunterResponse {
  status: number;
  body: unknown;
}

/**
 * One authenticated GET against the Hunter API. The key travels in a header, never in the URL, so it cannot end up in
 * request logs. Returns the status and parsed body (null when the body is not JSON) and leaves interpretation to the caller.
 */
export async function hunterGet(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<HunterResponse> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetchImpl(url.toString(), {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // An error page that is not JSON: the status is all we need.
  }
  return { status: res.status, body };
}

/** A friendly error for a failed Hunter call. Never includes the key or the vendor's raw body. */
export function hunterError(status: number): AppError {
  if (status === 401) {
    return new AppError("The contact-data provider rejected our API key. Check CONTACT_DATA_API_KEY and EMAIL_VERIFY_API_KEY.", 502, "provider_auth");
  }
  if (status === 403 || status === 429) {
    return new AppError("The contact-data provider's usage limit has been reached. Try again later or upgrade the plan.", 503, "provider_quota");
  }
  return new AppError("The contact-data provider could not answer right now. Please try again in a moment.", 502, "provider_error");
}
