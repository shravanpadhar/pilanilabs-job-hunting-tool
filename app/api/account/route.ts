import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { handler } from "@/lib/errors";
import { log } from "@/lib/logger";
import { removeUserFiles } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

const bodySchema = z.object({ confirm: z.literal("DELETE") });

/** "Delete my data": files, database rows (cascade) and the Supabase auth user. Irreversible. */
export const DELETE = handler("account_delete", async (request: Request) => {
  const user = await requireUserApi();
  bodySchema.parse(await request.json());

  // Mailbox tokens: provider-side revocation is added with the Gmail adapter (Phase 4); the encrypted rows
  // are deleted below by the cascade. SuppressionEntry and AuditEvent have no relation to User, so they
  // outlive the account on purpose (hashed addresses and opaque ids only).
  await audit({ userId: user.id, action: "account.deleted", entityType: "User", entityId: user.id }, { strict: true });
  await removeUserFiles(user.id);
  await db.user.delete({ where: { id: user.id } }); // cascades to resumes, matches, tailored resumes, applications, searches, usage, reviews…

  if (flags.supabase && !flags.devAuth) {
    try {
      if (flags.supabaseStorage) await supabaseAdmin().auth.admin.deleteUser(user.id);
      await (await createSupabaseServer()).auth.signOut();
    } catch (err) {
      log.warn("account_auth_cleanup_failed", { message: (err as Error).message });
    }
  }
  log.info("account_deleted", { userId: user.id });
  return NextResponse.json({ ok: true });
});
