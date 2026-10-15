import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Supabase redirects here after magic-link / Google sign-in with ?code=… (PKCE). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "");

  if (!flags.supabase || !code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=auth`);
  const hasResume = (await db.resume.count({ where: { userId: user.id } })) > 0;
  return NextResponse.redirect(`${origin}${hasResume ? next || "/jobs" : "/onboarding"}`);
}
