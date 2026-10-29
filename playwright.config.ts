import { defineConfig, devices } from "@playwright/test";

// The E2E test runs against the dev server with DEV_AUTH_BYPASS=true (no Supabase
// needed) and a local Postgres seeded with `npm run db:seed`.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  // First visits compile routes in dev mode and approvals render PDFs; the 5 s default is too tight for that.
  expect: { timeout: 20_000 },
  retries: 0,
  // All tests share one dev user and database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 240_000,
        env: {
          DEV_AUTH_BYPASS: "true",
          // Never run end-to-end tests against a real database or live services. The remote Supabase URL in .env.local is
          // overridden here; pass E2E_DATABASE_URL to point at a different TEST database.
          DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/pilanilabs",
          DIRECT_URL: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/pilanilabs",
          AI_PROVIDER: "fake",
          ANTHROPIC_API_KEY: "",
          OPENROUTER_API_KEY: "",
          EXTERNAL_FAKES: "true",
          MAILBOX_PROVIDER: "fake",
          CONTACT_DATA_PROVIDER: "fake",
          EMAIL_VERIFY_PROVIDER: "fake",
          QUEUE_PROVIDER: "inline",
          RESEND_API_KEY: "",
          TWILIO_ACCOUNT_SID: "",
          GOOGLE_OAUTH_CLIENT_ID: "",
        },
      },
});
