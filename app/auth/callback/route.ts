import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Supabase redirects here after Google sign-in (and PKCE magic links) with ?code=… */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "");

  // Google / Supabase report problems as ?error=…&error_description=…
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return NextResponse.redirect(`${origin}/login?error=provider&detail=${encodeURIComponent(providerError.slice(0, 160))}`);
  if (!flags.supabase || !code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // The PKCE verifier lives in the browser that asked for the link; opening it elsewhere lands here.
    const wrongBrowser = /code verifier|pkce|auth code/i.test(error.message);
    return NextResponse.redirect(`${origin}/login?error=${wrongBrowser ? "browser" : "auth"}`);
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=auth`);
  const hasResume = (await db.resume.count({ where: { userId: user.id } })) > 0;
  return NextResponse.redirect(`${origin}${hasResume ? next || "/jobs" : "/onboarding"}`);
}
