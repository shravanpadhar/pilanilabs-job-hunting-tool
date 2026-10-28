import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Append-only audit trail: who approved, sent, paused or deleted what, and when (spec C3).
 * AuditEvent has no relation to User and outlives the account, so `detail` must never contain personal
 * data. `scrubDetail` enforces that: plaintext email addresses are replaced and long free text is cut.
 */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAX_STRING = 200;
const MAX_DEPTH = 4;

export function scrubDetail(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.replace(EMAIL_RE, "[email]").slice(0, MAX_STRING);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubDetail(v, depth + 1) ?? "");
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const s = scrubDetail(v, depth + 1);
      if (s !== null) out[k] = s;
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}

export interface AuditInput {
  userId?: string | null;
  action: string; // e.g. "message.approved", "message.sent", "sending.paused", "admin.viewed"
  entityType: string;
  entityId?: string | null;
  detail?: unknown;
}

/** Never throws into the caller's flow for non-critical events; pass `{ strict: true }` where the record IS the guarantee (approvals, sends). */
export async function audit(input: AuditInput, opts: { strict?: boolean } = {}): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        detail: scrubDetail(input.detail) ?? undefined,
      },
    });
  } catch (err) {
    log.error("audit_write_failed", err, { action: input.action });
    if (opts.strict) throw err;
  }
}
