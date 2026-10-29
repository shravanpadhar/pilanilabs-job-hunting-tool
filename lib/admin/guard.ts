import { notFound } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireUser, requireUserApi, type SessionUser } from "@/lib/auth";
import { flags, env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Admin access is an allow-list of email addresses (ADMIN_EMAILS), plus the local dev user when the dev sign-in shortcut is
 * on. Everyone else gets a 404 (pages) or 403 (API) so the console is not even discoverable. EVERY admin read and write is
 * recorded in the audit log with the admin's id (spec section 7: "admin access is logged").
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (flags.devAuth) return true; // local development only: devAuth can never be on in production
  return env.adminEmails.includes(email.trim().toLowerCase());
}

export async function requireAdmin(section: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  await audit({ userId: user.id, action: "admin.viewed", entityType: "AdminConsole", entityId: section });
  return user;
}

export async function requireAdminApi(action: string, detail?: unknown): Promise<SessionUser> {
  const user = await requireUserApi();
  if (!isAdminEmail(user.email)) throw new AppError("Not allowed.", 403, "forbidden");
  await audit({ userId: user.id, action: `admin.${action}`, entityType: "AdminConsole", detail });
  return user;
}
