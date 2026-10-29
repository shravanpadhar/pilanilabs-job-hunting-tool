import { z } from "zod";
import type { EmailVerification } from "@/generated/prisma/enums";
import { log } from "@/lib/logger";
import { HUNTER_CREDIT_COST_MICROS, hunterError, hunterGet, type FetchLike } from "@/lib/providers/hunter/client";
import type { EmailVerifier, VerifyResult } from "@/lib/providers/verify";

/** A verification costs half a Hunter credit (estimate, see HUNTER_CREDIT_COST_MICROS). */
const VERIFY_COST_MICROS = Math.round(HUNTER_CREDIT_COST_MICROS / 2);
const MAX_ATTEMPTS = 3;

const responseSchema = z.object({ data: z.object({ status: z.string() }) });

/** Hunter statuses -> our four. Anything unrecognised is UNKNOWN, which asks the candidate to decide. */
export function mapHunterStatus(status: string): EmailVerification {
  switch (status.toLowerCase()) {
    case "valid":
      return "VALID";
    case "invalid":
    case "disposable":
      return "INVALID";
    case "accept_all": // the server accepts every address, so a real mailbox is not proven
    case "webmail":
      return "RISKY";
    default:
      return "UNKNOWN";
  }
}

/**
 * Email deliverability checks through Hunter.io's verifier.
 * A wrong key stops the run loudly (a setup problem). A temporary problem (limit reached, outage, timeout) returns UNKNOWN
 * for that address instead, so one bad call does not fail a whole search; UNKNOWN is never sent without the candidate's decision.
 */
export class HunterEmailVerifier implements EmailVerifier {
  readonly name = "hunter";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async verify(email: string): Promise<VerifyResult> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res;
      try {
        res = await hunterGet("/email-verifier", { email: email.trim().toLowerCase() }, this.apiKey, this.fetchImpl);
      } catch (err) {
        log.warn("hunter_verify_unreachable", { feature: "verify", error: err instanceof Error ? err.message : String(err) });
        return { result: "UNKNOWN", costMicros: 0 };
      }
      if (res.status === 202) {
        // Hunter is still checking this address: wait and ask again.
        if (attempt < MAX_ATTEMPTS) await this.sleep(1_500);
        continue;
      }
      if (res.status === 401) throw hunterError(401);
      if (res.status !== 200) {
        log.warn("hunter_verify_unavailable", { feature: "verify", status: res.status });
        return { result: "UNKNOWN", costMicros: 0 };
      }
      const parsed = responseSchema.safeParse(res.body);
      if (!parsed.success) return { result: "UNKNOWN", costMicros: 0 };
      return { result: mapHunterStatus(parsed.data.data.status), costMicros: VERIFY_COST_MICROS };
    }
    return { result: "UNKNOWN", costMicros: 0 };
  }
}
