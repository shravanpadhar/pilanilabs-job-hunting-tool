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
  get aiProvider(): "anthropic" | "openrouter" {
    return read("AI_PROVIDER")?.toLowerCase() === "openrouter" ? "openrouter" : "anthropic";
  },
  get openrouterKey() {
    return read("OPENROUTER_API_KEY");
  },
  get openrouterBaseUrl() {
    return (read("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
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
};

export const DEV_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "dev@pilanilabs.local",
  name: "Dev User",
} as const;
