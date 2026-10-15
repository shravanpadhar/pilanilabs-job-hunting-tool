import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { flags } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/onboarding");
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-md pt-6">
      <LoginForm next={next} supabaseReady={flags.supabase} devAuth={flags.devAuth} initialError={sp.error === "auth" ? "That sign-in link didn't work or has expired. Please try again." : undefined} />
    </div>
  );
}
