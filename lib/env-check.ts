import { z } from "zod";
import { parseKey32 } from "@/lib/crypto/key";

/**
 * Startup environment check. Pure (takes the env as an argument) so it is unit-testable.
 * It reports variable NAMES and what is wrong, never values.
 *
 * Production rules:
 *  - core secrets are always required (database, Supabase, cron, AI, encryption and signing keys);
 *  - dev-only switches (DEV_AUTH_BYPASS, EXTERNAL_FAKES) must be off;
 *  - when OUTREACH_SENDING_ENABLED=true, every real outreach provider must be configured and fakes are refused.
 * Outside production nothing is required (everything has a fake), so local dev and tests need no keys.
 */
export interface EnvIssue {
  key: string;
  problem: string;
}

type Source = Record<string, string | undefined>;

const present = (s: Source, k: string) => Boolean(s[k] && s[k]!.trim() !== "");
const longSecret = z.string().trim().min(32);

export function checkEnv(source: Source): EnvIssue[] {
  if (source.NODE_ENV !== "production") return [];
  const issues: EnvIssue[] = [];
  const need = (key: string, problem = "is required in production") => {
    if (!present(source, key)) issues.push({ key, problem });
  };

  for (const key of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) need(key);

  if (!present(source, "NEXT_PUBLIC_APP_URL")) issues.push({ key: "NEXT_PUBLIC_APP_URL", problem: "is required in production" });
  else if (!/^https:\/\//i.test(source.NEXT_PUBLIC_APP_URL!)) issues.push({ key: "NEXT_PUBLIC_APP_URL", problem: "must be an https:// URL in production" });

  if (!present(source, "CRON_SECRET")) issues.push({ key: "CRON_SECRET", problem: "is required in production" });
  else if (!longSecret.safeParse(source.CRON_SECRET).success) issues.push({ key: "CRON_SECRET", problem: "must be at least 32 characters (openssl rand -hex 32)" });

  if (source.AI_PROVIDER?.toLowerCase() === "fake") issues.push({ key: "AI_PROVIDER", problem: 'must not be "fake" in production' });
  const ai = source.AI_PROVIDER?.toLowerCase() === "openrouter" ? "OPENROUTER_API_KEY" : "ANTHROPIC_API_KEY";
  need(ai, "is required in production for the selected AI_PROVIDER");

  if (!present(source, "TOKEN_ENCRYPTION_KEY")) issues.push({ key: "TOKEN_ENCRYPTION_KEY", problem: "is required in production" });
  else if (!parseKey32(source.TOKEN_ENCRYPTION_KEY)) issues.push({ key: "TOKEN_ENCRYPTION_KEY", problem: "must be 32 random bytes as 64 hex chars or base64" });
  if (present(source, "TOKEN_ENCRYPTION_KEY_PREVIOUS") && !parseKey32(source.TOKEN_ENCRYPTION_KEY_PREVIOUS)) {
    issues.push({ key: "TOKEN_ENCRYPTION_KEY_PREVIOUS", problem: "must be 32 random bytes as 64 hex chars or base64" });
  }

  for (const key of ["SUPPRESSION_HASH_KEY", "OPT_OUT_SIGNING_KEY"]) {
    if (!present(source, key)) issues.push({ key, problem: "is required in production" });
    else if (!longSecret.safeParse(source[key]).success) issues.push({ key, problem: "must be at least 32 characters" });
  }

  if (source.DEV_AUTH_BYPASS === "true") issues.push({ key: "DEV_AUTH_BYPASS", problem: "must never be set in production" });
  if (source.EXTERNAL_FAKES === "true") issues.push({ key: "EXTERNAL_FAKES", problem: "must never be set in production" });

  // Sending is explicitly switched on: every real provider must be in place and fakes are refused.
  if (source.OUTREACH_SENDING_ENABLED?.toLowerCase() === "true" || source.OUTREACH_SENDING_ENABLED === "1") {
    need("GOOGLE_OAUTH_CLIENT_ID", "is required when OUTREACH_SENDING_ENABLED=true");
    need("GOOGLE_OAUTH_CLIENT_SECRET", "is required when OUTREACH_SENDING_ENABLED=true");
    need("CONTACT_DATA_API_KEY", "is required when OUTREACH_SENDING_ENABLED=true");
    need("EMAIL_VERIFY_API_KEY", "is required when OUTREACH_SENDING_ENABLED=true");
    need("INNGEST_EVENT_KEY", "is required when OUTREACH_SENDING_ENABLED=true");
    need("INNGEST_SIGNING_KEY", "is required when OUTREACH_SENDING_ENABLED=true");
    need("RESEND_API_KEY", "is required when OUTREACH_SENDING_ENABLED=true (reply notifications)");
    need("ADMIN_EMAILS", "is required when OUTREACH_SENDING_ENABLED=true");
    for (const [key, fake] of [
      ["MAILBOX_PROVIDER", "fake"],
      ["CONTACT_DATA_PROVIDER", "fake"],
      ["EMAIL_VERIFY_PROVIDER", "fake"],
      ["QUEUE_PROVIDER", "inline"],
    ] as const) {
      if (source[key]?.toLowerCase() === fake) issues.push({ key, problem: `must not be "${fake}" when OUTREACH_SENDING_ENABLED=true` });
    }
  }
  return issues;
}

/** Throws one error listing every problem (names only). Called from instrumentation.ts at server start. */
export function assertEnv(source: Source = process.env): void {
  const issues = checkEnv(source);
  if (issues.length === 0) return;
  const lines = issues.map((i) => `  - ${i.key} ${i.problem}`).join("\n");
  throw new Error(`Invalid production environment:\n${lines}\nSee .env.example and the README deployment checklist.`);
}
