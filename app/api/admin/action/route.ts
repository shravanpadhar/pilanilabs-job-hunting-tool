import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/guard";
import { audit } from "@/lib/audit";
import { grantCredits } from "@/lib/billing/credits";
import { addDomainSuppression, addSuppression, isPlausibleEmail } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";
import { AppError, handler } from "@/lib/errors";
import { resumeSending } from "@/lib/outreach/health";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";

const email = z.string().trim().toLowerCase().refine(isPlausibleEmail, "Enter a valid email address.");
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause_user"), email, reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("resume_user"), email }),
  z.object({ action: z.literal("set_ceiling"), email, costCeilingMicros: z.number().int().min(0).max(1_000_000_000).nullable() }),
  z.object({ action: z.literal("suppress_email"), target: email, reason: z.enum(["MANUAL", "OPT_OUT", "COMPLAINT"]).default("MANUAL") }),
  z.object({ action: z.literal("suppress_domain"), domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like example.com.") }),
  z.object({ action: z.literal("grant_credits"), email, credits: z.number().int().min(1).max(10_000), note: z.string().trim().min(3).max(120) }),
  z.object({ action: z.literal("set_setting"), key: z.enum(["pricing", "limits"]), value: z.unknown() }),
]);

async function userByEmail(e: string) {
  const u = await db.user.findUnique({ where: { email: e }, select: { id: true } });
  if (!u) throw new AppError("No candidate with that email.", 404, "not_found");
  return u.id;
}

/** Admin controls. Authorised by the allow-list and recorded in the audit log twice (access + the specific change). */
export const POST = handler("admin_action", async (request: Request) => {
  const body = bodySchema.parse(await request.json());
  const admin = await requireAdminApi(body.action);

  switch (body.action) {
    case "pause_user": {
      const userId = await userByEmail(body.email);
      await db.outreachProfile.upsert({ where: { userId }, create: { userId, sendingPausedAt: new Date(), pauseReason: body.reason, pausedBy: "SYSTEM" }, update: { sendingPausedAt: new Date(), pauseReason: body.reason, pausedBy: "SYSTEM" } });
      await audit({ userId: admin.id, action: "sending.admin_paused", entityType: "OutreachProfile", entityId: userId, detail: { reason: body.reason } });
      break;
    }
    case "resume_user":
      await resumeSending(await userByEmail(body.email), "ADMIN");
      break;
    case "set_ceiling": {
      const userId = await userByEmail(body.email);
      await db.outreachProfile.upsert({ where: { userId }, create: { userId, costCeilingMicros: body.costCeilingMicros }, update: { costCeilingMicros: body.costCeilingMicros } });
      await audit({ userId: admin.id, action: "cost_ceiling.changed", entityType: "OutreachProfile", entityId: userId, detail: { micros: body.costCeilingMicros } });
      break;
    }
    case "suppress_email":
      await addSuppression(body.target, body.reason);
      await audit({ userId: admin.id, action: "suppression.added", entityType: "SuppressionEntry", detail: { kind: "email", reason: body.reason } });
      break;
    case "suppress_domain":
      await addDomainSuppression(body.domain);
      await audit({ userId: admin.id, action: "suppression.added", entityType: "SuppressionEntry", detail: { kind: "domain", domain: body.domain } });
      break;
    case "grant_credits":
      await grantCredits(await userByEmail(body.email), body.credits, "ADJUSTMENT", "admin", `${admin.id}:${Date.now()}`, admin.id);
      break;
    case "set_setting":
      await setSetting(body.key, body.value, admin.id);
      break;
  }
  return NextResponse.json({ ok: true });
});
