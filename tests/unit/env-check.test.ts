import { describe, expect, it } from "vitest";
import { assertEnv, checkEnv } from "@/lib/env-check";

const HEX = "a".repeat(64);
const LONG = "x".repeat(40);

/** A production environment with every core secret present. */
const coreProd = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db.example.com:6543/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  CRON_SECRET: LONG,
  ANTHROPIC_API_KEY: "k",
  TOKEN_ENCRYPTION_KEY: HEX,
  SUPPRESSION_HASH_KEY: LONG,
  OPT_OUT_SIGNING_KEY: LONG,
};

describe("checkEnv", () => {
  it("requires nothing outside production (everything has a fake)", () => {
    expect(checkEnv({ NODE_ENV: "development" })).toEqual([]);
    expect(checkEnv({ NODE_ENV: "test" })).toEqual([]);
    expect(checkEnv({})).toEqual([]);
  });

  it("accepts a complete production environment", () => {
    expect(checkEnv(coreProd)).toEqual([]);
  });

  it("fails loudly in production when a core secret is missing, naming it but never a value", () => {
    const { TOKEN_ENCRYPTION_KEY: _omit, ...rest } = coreProd;
    void _omit;
    const issues = checkEnv(rest);
    expect(issues.map((i) => i.key)).toContain("TOKEN_ENCRYPTION_KEY");
    expect(() => assertEnv(rest)).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => assertEnv({ ...coreProd, CRON_SECRET: "super-secret-but-short" })).toThrow(/CRON_SECRET/);
    try {
      assertEnv({ ...coreProd, CRON_SECRET: "super-secret-but-short" });
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-but-short");
    }
  });

  it("requires the AI key for the selected provider", () => {
    const { ANTHROPIC_API_KEY: _a, ...noKey } = coreProd;
    void _a;
    expect(checkEnv(noKey).map((i) => i.key)).toContain("ANTHROPIC_API_KEY");
    expect(checkEnv({ ...noKey, AI_PROVIDER: "openrouter" }).map((i) => i.key)).toContain("OPENROUTER_API_KEY");
    expect(checkEnv({ ...noKey, AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k" })).toEqual([]);
  });

  it("validates key formats and the https app URL", () => {
    expect(checkEnv({ ...coreProd, TOKEN_ENCRYPTION_KEY: "too-short" }).map((i) => i.key)).toContain("TOKEN_ENCRYPTION_KEY");
    expect(checkEnv({ ...coreProd, TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") })).toEqual([]);
    expect(checkEnv({ ...coreProd, TOKEN_ENCRYPTION_KEY_PREVIOUS: "bad" }).map((i) => i.key)).toContain("TOKEN_ENCRYPTION_KEY_PREVIOUS");
    expect(checkEnv({ ...coreProd, NEXT_PUBLIC_APP_URL: "http://app.example.com" }).map((i) => i.key)).toContain("NEXT_PUBLIC_APP_URL");
    expect(checkEnv({ ...coreProd, SUPPRESSION_HASH_KEY: "short" }).map((i) => i.key)).toContain("SUPPRESSION_HASH_KEY");
  });

  it("refuses dev-only switches in production", () => {
    expect(checkEnv({ ...coreProd, DEV_AUTH_BYPASS: "true" }).map((i) => i.key)).toContain("DEV_AUTH_BYPASS");
    expect(checkEnv({ ...coreProd, EXTERNAL_FAKES: "true" }).map((i) => i.key)).toContain("EXTERNAL_FAKES");
  });

  it("with sending enabled, requires every real provider and refuses fakes", () => {
    const issues = checkEnv({ ...coreProd, OUTREACH_SENDING_ENABLED: "true" }).map((i) => i.key);
    for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "CONTACT_DATA_API_KEY", "EMAIL_VERIFY_API_KEY", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "RESEND_API_KEY", "ADMIN_EMAILS"]) {
      expect(issues).toContain(k);
    }
    const full = {
      ...coreProd,
      OUTREACH_SENDING_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "a",
      GOOGLE_OAUTH_CLIENT_SECRET: "b",
      CONTACT_DATA_API_KEY: "c",
      EMAIL_VERIFY_API_KEY: "d",
      INNGEST_EVENT_KEY: "e",
      INNGEST_SIGNING_KEY: "f",
      RESEND_API_KEY: "g",
      ADMIN_EMAILS: "me@example.com",
    };
    expect(checkEnv(full)).toEqual([]);
    expect(checkEnv({ ...full, MAILBOX_PROVIDER: "fake" }).map((i) => i.key)).toContain("MAILBOX_PROVIDER");
    expect(checkEnv({ ...full, QUEUE_PROVIDER: "inline" }).map((i) => i.key)).toContain("QUEUE_PROVIDER");
  });

  it("does not demand outreach providers while sending is off", () => {
    expect(checkEnv({ ...coreProd, OUTREACH_SENDING_ENABLED: "false" })).toEqual([]);
    expect(checkEnv(coreProd)).toEqual([]);
  });
});
