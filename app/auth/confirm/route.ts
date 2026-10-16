import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createSupabaseServer } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "recovery", "invite", "email_change"];

/**
 * Email sign-in link target: /auth/confirm?token_hash=…&type=email&next=/onboarding
 *
 * Unlike the PKCE `?code=` flow, this verifies the one-time token on the server, so the link works in ANY
 * browser or device — the person doesn't have to open it in the browser where they asked for it.
 * (Requires the Supabase email templates to link here — see README → "Cross-browser email sign-in".)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "");

  if (!flags.supabase || !tokenHash || !type || !TYPES.includes(type)) return NextResponse.redirect(`${origin}/login?error=link`);

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(`${origin}/login?error=expired`);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=link`);
  const hasResume = (await db.resume.count({ where: { userId: user.id } })) > 0;
  return NextResponse.redirect(`${origin}${hasResume ? next || "/jobs" : "/onboarding"}`);
}
