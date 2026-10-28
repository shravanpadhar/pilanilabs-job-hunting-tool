/**
 * Environment access. Values are read lazily so `next build` works without secrets.
 * Never import this from a client component (it exposes server-only secrets).
 */
const read = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const env = {
  get appUrl() {
    return read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  },
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },
  get storageBucket() {
    return read("SUPABASE_STORAGE_BUCKET") ?? "resumes";
  },
  get anthropicKey() {
    return read("ANTHROPIC_API_KEY");
  },
  /** Which LLM backend to use: "anthropic" (default) or "openrouter". */
  get aiProvider(): "anthropic" | "openrouter" | "fake" {
    const v = read("AI_PROVIDER")?.toLowerCase();
    if (v === "openrouter") return "openrouter";
    // "fake" = deterministic offline model for the outreach features (tests, local dev). Refused in production.
    if (v === "fake") return "fake";
    return "anthropic";
  },
  get openrouterKey() {
    return read("OPENROUTER_API_KEY");
  },
  get openrouterBaseUrl() {
    return (read("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  },
  /**
   * Stage-2 AI match scoring. ON by default for every provider; set AI_MATCH_SCORING=false to turn it off
   * (useful on free OpenRouter models, which have small daily request quotas).
   */
  get aiMatchScoring(): boolean {
    const v = read("AI_MATCH_SCORING")?.toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return true;
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  get rapidApiKey() {
    return read("RAPIDAPI_KEY");
  },
  get adzunaAppId() {
    return read("ADZUNA_APP_ID");
  },
  get adzunaAppKey() {
    return read("ADZUNA_APP_KEY");
  },
  get sourcesContact() {
    return read("JOB_SOURCES_CONTACT") ?? "https://www.pilanilabs.com";
  },
  get resendKey() {
    return read("RESEND_API_KEY");
  },
  get resendFrom() {
    return read("RESEND_FROM") ?? "Pilanilabs Jobs <onboarding@resend.dev>";
  },
  get twilioSid() {
    return read("TWILIO_ACCOUNT_SID");
  },
  get twilioToken() {
    return read("TWILIO_AUTH_TOKEN");
  },
  get twilioWhatsappFrom() {
    return read("TWILIO_WHATSAPP_FROM");
  },
  get twilioContentSid() {
    return read("TWILIO_WHATSAPP_CONTENT_SID");
  },

  // ── Outreach engine ─────────────────────────────────────────────────────────
  // Each provider is "real" when its key is configured and "fake" otherwise, unless forced with *_PROVIDER.
  get queueProvider(): "inngest" | "inline" {
    const v = read("QUEUE_PROVIDER")?.toLowerCase();
    if (v === "inngest" || v === "inline") return v;
    return read("INNGEST_EVENT_KEY") ? "inngest" : "inline";
  },
  get inngestEventKey() {
    return read("INNGEST_EVENT_KEY");
  },
  get inngestSigningKey() {
    return read("INNGEST_SIGNING_KEY");
  },
  get googleClientId() {
    return read("GOOGLE_OAUTH_CLIENT_ID");
  },
  get googleClientSecret() {
    return read("GOOGLE_OAUTH_CLIENT_SECRET");
  },
  get microsoftClientId() {
    return read("MICROSOFT_OAUTH_CLIENT_ID");
  },
  get microsoftClientSecret() {
    return read("MICROSOFT_OAUTH_CLIENT_SECRET");
  },
  get mailboxProvider(): "gmail" | "fake" {
    const v = read("MAILBOX_PROVIDER")?.toLowerCase();
    if (v === "gmail" || v === "fake") return v;
    return read("GOOGLE_OAUTH_CLIENT_ID") && read("GOOGLE_OAUTH_CLIENT_SECRET") ? "gmail" : "fake";
  },
  get jobLookupProvider(): "licensed" | "fake" {
    return read("JOB_LOOKUP_PROVIDER")?.toLowerCase() === "licensed" ? "licensed" : "fake";
  },
  get contactDataApiKey() {
    return read("CONTACT_DATA_API_KEY");
  },
  get contactDataProvider(): "licensed" | "fake" {
    const v = read("CONTACT_DATA_PROVIDER")?.toLowerCase();
    if (v === "licensed" || v === "fake") return v;
    return read("CONTACT_DATA_API_KEY") ? "licensed" : "fake";
  },
  get emailVerifyApiKey() {
    return read("EMAIL_VERIFY_API_KEY");
  },
  get emailVerifyProvider(): "licensed" | "fake" {
    const v = read("EMAIL_VERIFY_PROVIDER")?.toLowerCase();
    if (v === "licensed" || v === "fake") return v;
    return read("EMAIL_VERIFY_API_KEY") ? "licensed" : "fake";
  },
  /** 32 random bytes, base64 or hex. Wraps the per-token data keys of stored mailbox tokens. */
  get tokenEncryptionKey() {
    return read("TOKEN_ENCRYPTION_KEY");
  },
  /** Previous key kept during a rotation so old tokens can still be read. */
  get tokenEncryptionKeyPrevious() {
    return read("TOKEN_ENCRYPTION_KEY_PREVIOUS");
  },
  /** HMAC key for suppression-list hashes (D-09). Losing or changing it makes existing entries stop matching. */
  get suppressionHashKey() {
    return read("SUPPRESSION_HASH_KEY");
  },
  /** HMAC key that signs opt-out links in outgoing email. */
  get optOutSigningKey() {
    return read("OPT_OUT_SIGNING_KEY");
  },
  get adminEmails(): string[] {
    return (read("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  /** Global kill switch: nothing is sent unless this is "true". Off by default in production. */
  get outreachSendingEnabled(): boolean {
    const v = read("OUTREACH_SENDING_ENABLED")?.toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return process.env.NODE_ENV !== "production";
  },
  get sentryDsn() {
    return read("SENTRY_DSN");
  },
};

export const flags = {
  get supabase() {
    return Boolean(env.supabaseUrl && env.supabaseAnonKey);
  },
  get supabaseStorage() {
    return Boolean(env.supabaseUrl && env.supabaseServiceKey);
  },
  get anthropic() {
    return Boolean(env.anthropicKey);
  },
  /** An AI backend is configured (the one selected by AI_PROVIDER has its key). */
  get ai() {
    // The fake provider deliberately reports false: the legacy features (parse, score, tailor...) keep their
    // no-key fallbacks, while the outreach features call the fake model directly.
    if (env.aiProvider === "fake") return false;
    return env.aiProvider === "openrouter" ? Boolean(env.openrouterKey) : Boolean(env.anthropicKey);
  },
  /** Dev-only auth shortcut; can never be active in production. */
  get devAuth() {
    return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";
  },
  get email() {
    return Boolean(env.resendKey);
  },
  get whatsapp() {
    return Boolean(env.twilioSid && env.twilioToken && env.twilioWhatsappFrom);
  },
  /**
   * Local / test-only switch that lets dev-only endpoints (fake clock, injected replies) and fixture
   * HTTP responses exist. Hard-disabled in production no matter what the variable says.
   */
  get externalFakes() {
    return process.env.NODE_ENV !== "production" && process.env.EXTERNAL_FAKES === "true";
  },
};

export const DEV_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "dev@pilanilabs.local",
  name: "Dev User",
} as const;
