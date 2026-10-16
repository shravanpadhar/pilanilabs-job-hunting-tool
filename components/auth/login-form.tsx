"use client";

import { KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { createSupabaseBrowser } from "@/lib/supabase/client";

/** Turn Supabase's raw messages into something a job seeker can act on. */
function friendly(message: string, what: "email" | "google" | "code"): string {
  if (/rate limit|too many|security purposes/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  if (what === "google" && /provider is not enabled|unsupported provider/i.test(message)) return "Google sign-in isn't switched on for this site yet. Use the email option, or ask the site owner to enable Google in Supabase.";
  if (what === "code" && /expired|invalid/i.test(message)) return "That code is wrong or has expired. Check the latest email, or request a new code.";
  if (what === "email" && /not authorized|not allowed|signups? not allowed/i.test(message)) return "That email address isn't allowed to sign in. Try a different one.";
  if (what === "email" && /invalid email|valid email/i.test(message)) return "That doesn't look like a valid email address.";
  return what === "email" ? "We couldn't send the email right now. Please try again in a moment." : what === "google" ? "Google sign-in isn't available right now. Try the email option." : "We couldn't verify that code. Please try again.";
}

export function LoginForm({ next, supabaseReady, devAuth, initialError }: { next: string; supabaseReady: boolean; devAuth: boolean; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | "code" | null>(null);
  const [error, setError] = useState<string | undefined>(initialError);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy("email");
    const { error: err } = await createSupabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(null);
    if (err) setError(friendly(err.message, "email"));
    else setSent(true);
  }

  /** Works in any browser or device: the code from the email is verified directly, no same-browser requirement. */
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy("code");
    const { error: err } = await createSupabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
    if (err) {
      setBusy(null);
      setError(friendly(err.message, "code"));
      return;
    }
    window.location.assign(next); // full reload so the server sees the new session cookie
  }

  async function google() {
    setError(undefined);
    setBusy("google");
    const { error: err } = await createSupabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (err) {
      setBusy(null);
      setError(friendly(err.message, "google"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Sign in to Pilanilabs</CardTitle>
        <CardDescription>No password. We email you a one-time link and code, or you can continue with Google.</CardDescription>
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
            <div className="space-y-4">
              <Notice tone="success" title="Check your inbox">
                We sent a sign-in email to <strong>{email}</strong>. It can take a minute — check spam too. You can click the link in it, <strong>or type the code below</strong> (use this if you opened the email on another device or browser).
              </Notice>
              <form onSubmit={verifyCode} className="space-y-3">
                <Field label="Code from the email" htmlFor="otp" hint="6–8 digits. Works in any browser.">
                  <Input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,10}" required placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <Button type="submit" className="w-full" loading={busy === "code"}>
                  <KeyRound /> Sign in with code
                </Button>
              </form>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSent(false); setCode(""); setError(undefined); }}>
                Use a different email / send again
              </Button>
            </div>
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
