import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { flags } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  auth: "That sign-in didn't work or has expired. Please try again.",
  link: "That sign-in link is incomplete. Please request a new one.",
  expired: "That sign-in link has expired or was already used. Request a new one, or type the code from the email instead.",
  browser: "That link was opened in a different browser than the one you signed in from. Type the 6-digit code from the email here instead — it works anywhere.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; detail?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/onboarding");
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(next);

  const error =
    sp.error === "provider" ? `Google sign-in failed${sp.detail ? `: ${sp.detail}` : "."}` : sp.error ? (ERRORS[sp.error] ?? ERRORS.auth) : undefined;

  return (
    <div className="mx-auto max-w-md pt-6">
      <LoginForm next={next} supabaseReady={flags.supabase} devAuth={flags.devAuth} initialError={error} />
    </div>
  );
}
