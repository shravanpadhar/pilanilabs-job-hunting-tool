"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ next, supabaseReady, devAuth, initialError }: { next: string; supabaseReady: boolean; devAuth: boolean; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | undefined>(initialError);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy("email");
    const { error: err } = await createSupabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(null);
    if (err) setError("We couldn't send the link. Check the email address and try again.");
    else setSent(true);
  }

  async function google() {
    setError(undefined);
    setBusy("google");
    const { error: err } = await createSupabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (err) {
      setBusy(null);
      setError("Google sign-in isn't available right now. Try the email link instead.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Sign in to Pilanilabs</CardTitle>
        <CardDescription>No password. We email you a one-time link, or you can continue with Google.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="warning">{error}</Notice> : null}

        {devAuth ? (
          <Notice tone="info" title="Development mode">
            <p>DEV_AUTH_BYPASS is on — you are signed in as a local test user.</p>
            <Button asChild className="mt-3">
              <Link href={next}>Continue</Link>
            </Button>
          </Notice>
        ) : null}

        {!supabaseReady && !devAuth ? (
          <Notice tone="warning" title="Sign-in isn't configured">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see README), or set DEV_AUTH_BYPASS=true for local development.
          </Notice>
        ) : null}

        {supabaseReady ? (
          sent ? (
            <Notice tone="success" title="Check your inbox">
              We sent a sign-in link to <strong>{email}</strong>. It can take a minute to arrive — check spam too.
            </Notice>
          ) : (
            <>
              <form onSubmit={sendLink} className="space-y-3">
                <Field label="Email address" htmlFor="email">
                  <Input id="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button type="submit" className="w-full" loading={busy === "email"}>
                  <Mail /> Email me a sign-in link
                </Button>
              </form>
              <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={google} loading={busy === "google"}>
                Continue with Google
              </Button>
            </>
          )
        ) : null}

        <p className="text-xs text-muted-foreground">
          By continuing you agree to our <Link href="/privacy" className="underline">privacy policy</Link>. We never post or apply anywhere on your behalf.
        </p>
      </CardContent>
    </Card>
  );
}
