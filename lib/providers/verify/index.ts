import { createHash } from "node:crypto";
import type { EmailVerification } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { HunterEmailVerifier } from "@/lib/providers/verify/hunter";

export interface VerifyResult {
  result: EmailVerification;
  /** Cost of this call in millionths of a US dollar. */
  costMicros: number;
}

/** Licensed email-deliverability verification (syntax, domain, mailbox probe, catch-all detection...). */
export interface EmailVerifier {
  readonly name: string;
  verify(email: string): Promise<VerifyResult>;
}

/**
 * Deterministic fake: addresses containing "invalid" are INVALID, "risky" are RISKY, "unknown" are UNKNOWN,
 * a small hash-based share are RISKY (like a catch-all domain), everything else is VALID.
 */
export class FakeEmailVerifier implements EmailVerifier {
  readonly name = "fake";
  async verify(email: string): Promise<VerifyResult> {
    const e = email.trim().toLowerCase();
    let result: EmailVerification = "VALID";
    if (e.includes("invalid")) result = "INVALID";
    else if (e.includes("risky")) result = "RISKY";
    else if (e.includes("unknown")) result = "UNKNOWN";
    else if (parseInt(createHash("sha256").update(e).digest("hex").slice(0, 4), 16) % 20 === 0) result = "RISKY";
    return { result, costMicros: 8_000 };
  }
}

let override: EmailVerifier | null = null;
export function setVerifierForTests(v: EmailVerifier | null) {
  override = v;
}

export function getEmailVerifier(): EmailVerifier {
  if (override) return override;
  if (env.emailVerifyProvider !== "licensed") return new FakeEmailVerifier();
  const key = env.emailVerifyApiKey;
  if (!key) throw new AppError("EMAIL_VERIFY_API_KEY is not set, so emails cannot be verified.", 501, "verifier_not_configured");
  // "licensed" currently means Hunter.io. To use another vendor, add its adapter and return it here.
  return new HunterEmailVerifier(key);
}
