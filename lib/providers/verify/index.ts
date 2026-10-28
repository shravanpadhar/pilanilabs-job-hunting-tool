import { createHash } from "node:crypto";
import type { EmailVerification } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

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

/** ADAPTER STUB — implement with the verification provider you choose; authenticate with EMAIL_VERIFY_API_KEY (server only). */
export class LicensedEmailVerifierStub implements EmailVerifier {
  readonly name = "licensed-stub";
  async verify(_email: string): Promise<VerifyResult> {
    void _email;
    throw new AppError(
      "No email verification provider is connected yet. Implement lib/providers/verify/index.ts (LicensedEmailVerifierStub) or set EMAIL_VERIFY_PROVIDER=fake.",
      501,
      "verifier_not_configured",
    );
  }
}

let override: EmailVerifier | null = null;
export function setVerifierForTests(v: EmailVerifier | null) {
  override = v;
}

export function getEmailVerifier(): EmailVerifier {
  if (override) return override;
  return env.emailVerifyProvider === "licensed" ? new LicensedEmailVerifierStub() : new FakeEmailVerifier();
}
