import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Opt-out links in outgoing email. The token is "<targetId>.<signature>": the signature is an HMAC under
 * OPT_OUT_SIGNING_KEY, so a link cannot be forged or edited to opt out somebody else, and no database lookup
 * is needed to validate it. The token carries only an opaque id, never an address.
 */
function key(): string {
  const k = env.optOutSigningKey;
  if (k) return k;
  if (process.env.NODE_ENV === "production") throw new AppError("Opt-out signing is not configured.", 503, "optout_not_configured");
  return "dev-only-optout-signing-key-not-for-production";
}

const sign = (targetId: string) => createHmac("sha256", key()).update(`optout:${targetId}`).digest("base64url").slice(0, 32);

export function optOutToken(targetId: string): string {
  return `${targetId}.${sign(targetId)}`;
}

/** Returns the target id when the token is authentic, otherwise null. */
export function verifyOptOutToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export const optOutUrl = (targetId: string) => `${env.appUrl}/u/${optOutToken(targetId)}`;

/** The footer every email carries: honest sender identity, postal address, and a working opt-out (CAN-SPAM). */
export function emailFooter(input: { senderName: string; postalAddress: string; targetId: string }): string {
  return [
    "--",
    input.senderName.trim(),
    input.postalAddress.trim(),
    "",
    `If you would rather not hear from me, just reply "unsubscribe" or opt out here: ${optOutUrl(input.targetId)}`,
  ].join("\n");
}

export function composeEmailText(body: string, footer: string): string {
  return `${body.trimEnd()}\n\n${footer}`;
}
