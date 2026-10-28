import { createHmac } from "node:crypto";
import type { SuppressionReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Global do-not-contact list. Entries are HMAC hashes of the normalised address, never the address itself,
 * and the table has no relation to User, so it survives account deletion (spec section 8, D-09).
 */

/** Lowercase + trim. We deliberately do NOT strip "+tags" or Gmail dots: that could suppress a different person. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(normalizeEmail(email)) && email.length <= 254;
}

export function hashEmail(email: string, key = env.suppressionHashKey): string {
  if (!key) {
    // Outside production a fixed dev key keeps local runs and tests working; production is covered by the startup check.
    if (process.env.NODE_ENV === "production") throw new AppError("Suppression hashing is not configured.", 503, "suppression_not_configured");
    key = "dev-only-suppression-key-not-for-production";
  }
  return createHmac("sha256", key).update(normalizeEmail(email)).digest("hex");
}

/** Domain-level entries are stored as the hash of "@domain" (reason MANUAL), e.g. a company that asked us to stop. */
export function hashDomain(domain: string, key?: string): string {
  return hashEmail(`@${domain.trim().toLowerCase().replace(/^@/, "")}`, key);
}

function domainOf(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export async function isSuppressed(email: string): Promise<boolean> {
  const hashes = [hashEmail(email)];
  const domain = domainOf(email);
  if (domain) hashes.push(hashDomain(domain));
  const hit = await db.suppressionEntry.findFirst({ where: { emailHash: { in: hashes } }, select: { id: true } });
  return Boolean(hit);
}

/** Returns the subset of `emails` (normalised) that must not be contacted. One query for any number of addresses. */
export async function suppressedSet(emails: string[]): Promise<Set<string>> {
  const byHash = new Map<string, string[]>();
  const add = (h: string, e: string) => byHash.set(h, [...(byHash.get(h) ?? []), e]);
  for (const raw of emails) {
    const e = normalizeEmail(raw);
    add(hashEmail(e), e);
    const d = domainOf(e);
    if (d) add(hashDomain(d), e);
  }
  if (byHash.size === 0) return new Set();
  const rows = await db.suppressionEntry.findMany({ where: { emailHash: { in: [...byHash.keys()] } }, select: { emailHash: true } });
  return new Set(rows.flatMap((r) => byHash.get(r.emailHash) ?? []));
}

/** Idempotent: suppressing an address twice is fine, and the first reason is kept. */
export async function addSuppression(email: string, reason: SuppressionReason): Promise<string> {
  const emailHash = hashEmail(email);
  await db.suppressionEntry.upsert({ where: { emailHash }, create: { emailHash, reason }, update: {} });
  return emailHash;
}

export async function addDomainSuppression(domain: string, reason: SuppressionReason = "MANUAL"): Promise<string> {
  const emailHash = hashDomain(domain);
  await db.suppressionEntry.upsert({ where: { emailHash }, create: { emailHash, reason }, update: {} });
  return emailHash;
}
