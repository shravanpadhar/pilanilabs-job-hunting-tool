import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DEV_USER, flags } from "@/lib/env";
import { unauthorized } from "@/lib/errors";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

async function ensureUserRow(u: SessionUser): Promise<void> {
  const existing = await db.user.findUnique({ where: { id: u.id }, select: { id: true } });
  if (existing) return;
  try {
    await db.user.create({ data: { id: u.id, email: u.email, name: u.name } });
  } catch {
    // Concurrent request created it first, or the email belongs to a stale row.
    const again = await db.user.findUnique({ where: { id: u.id }, select: { id: true } });
    if (!again) throw new Error("Could not create user record.");
  }
}

/** The signed-in user (and their DB row), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (flags.devAuth) {
    const dev = { id: DEV_USER.id, email: DEV_USER.email, name: DEV_USER.name };
    await ensureUserRow(dev);
    return dev;
  }
  if (!flags.supabase) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u?.email) return null;
  const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
  const user: SessionUser = { id: u.id, email: u.email, name: meta.full_name ?? meta.name ?? null };
  await ensureUserRow(user);
  return user;
});

/** For pages / server components: redirect to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: throws a 401 AppError when signed out. */
export async function requireUserApi(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}
