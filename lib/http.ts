import { env } from "@/lib/env";
import { sleep } from "@/lib/utils";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

/** Polite JSON GET with timeout, one retry on 429/5xx/network errors, and an identifying User-Agent. */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { headers = {}, timeoutMs = 20_000, retries = 1 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": `PilanilabsJobTool/1.0 (+${env.sourcesContact})`,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const err = new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, res.status, url);
        if (retryable && attempt < retries) {
          lastErr = err;
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastErr = err;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
