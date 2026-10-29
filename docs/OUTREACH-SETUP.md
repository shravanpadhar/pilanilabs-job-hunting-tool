# Pilanilabs Career Platform: setup, deployment and launch checklist

This covers the outreach engine added on top of the Job Hunting Tool. The job-search workspace setup is in the main
[README](../README.md). Architecture and the reasons behind each choice: [docs/PLAN.md](PLAN.md), assumptions to confirm:
[docs/DECISIONS.md](DECISIONS.md).

## 0. What runs where

| Piece | Where | Notes |
|---|---|---|
| Web app + API routes | Vercel (Next.js) | Reads, writes and queues only; nothing slow runs in a request |
| Database, auth, files | Supabase | Postgres + RLS, private Storage bucket |
| Background work (sender, reply poller, reminders, health) | Inngest, served by `/api/inngest` | Vercel cannot run long-lived workers; Inngest calls your app on a schedule and on events |
| Candidate's mailbox | Gmail API via the candidate's own Google OAuth grant | No SMTP, no app passwords |
| Contacts + email verification | A licensed provider you choose (behind `ContactDataProvider` / `EmailVerifier`) | The repo ships fakes and a clearly marked stub |
| AI | Anthropic Claude (or OpenRouter) | Offline fake with `AI_PROVIDER=fake` for tests |

Everything has a fake, so the whole app runs locally with **zero real keys**: see "Run it locally".

## 1. Run it locally (no keys)

```bash
npm install
npm run db:local            # terminal 1: starts a local Postgres on port 54329 and keeps running
```
Terminal 2 (PowerShell):
```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/pilanilabs"; $env:DIRECT_URL=$env:DATABASE_URL
$env:DEV_AUTH_BYPASS="true"; $env:AI_PROVIDER="fake"; $env:EXTERNAL_FAKES="true"
npx prisma migrate deploy; npm run db:seed; npm run dev
```
Open http://localhost:3000, upload a resume, then **Outreach**. Paste `https://northwind.fixture.test/jobs/1` (a fixture job page that only exists when `EXTERNAL_FAKES=true`), connect the demo mailbox, find people, write drafts, approve, start. The test clock and reply injection live at `POST /api/dev/outreach` (404 unless `EXTERNAL_FAKES`).

Tests: `npm test` (unit) · `npm run test:db` (needs the local Postgres) · `npm run test:e2e` (needs the local Postgres; Playwright pins itself to it and to the fakes) · `npm run eval:fabrication` (verifier golden set).

## 2. Supabase

1. Create a project (choose the region closest to your users; India users: Mumbai if available). Note the region: set the Vercel function region next to it (section 4).
2. Project Settings → Database: copy the **pooled** string (port 6543) to `DATABASE_URL` and the **direct** string (port 5432) to `DIRECT_URL`.
3. Project Settings → API: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and (server only) `SUPABASE_SERVICE_ROLE_KEY`.
4. Apply the migrations **once, yourself**: `DIRECT_URL=... npx prisma migrate deploy`. The new ones are additive: `0003_outreach_core` (tables) and `0004_outreach_rls` (policies). RLS makes outreach tables read-only for signed-in users via the public API; approvals, recipients and credits can only be written by the server. Mailbox tokens, suppression list, audit log, provider usage and settings are unreachable from the public API.
5. Auth providers and the storage bucket are unchanged from the workspace setup.

## 3. Secrets you generate

```bash
openssl rand -hex 32   # run once per value below; never reuse one value for two purposes
```
| Variable | What it protects |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | Encrypts stored Gmail refresh tokens. Keep a copy in your password manager. Rotating: put the new key here and the old one in `TOKEN_ENCRYPTION_KEY_PREVIOUS`; tokens are re-wrapped lazily |
| `SUPPRESSION_HASH_KEY` | Keyed hash of do-not-contact addresses. **If lost or changed, existing entries stop matching: back it up and never rotate casually** |
| `OPT_OUT_SIGNING_KEY` | Signs the opt-out links in every email |
| `CRON_SECRET` | Protects `/api/cron/*` |

The app refuses to start in production when a required secret is missing or malformed, and names the variable (never the value).

## 4. Vercel

1. Import the repo; framework preset Next.js; build command `npm run build` (it runs `prisma generate`; no secrets are needed to build).
2. Add every variable from `.env.example` under Project → Settings → Environment Variables. Do **not** set `DEV_AUTH_BYPASS` or `EXTERNAL_FAKES` (the app refuses to boot if you do). Set `NEXT_PUBLIC_APP_URL` to your https URL.
3. Region: set the function region near your database (Settings → Functions). Example: a Supabase project in `ap-northeast-2` pairs with Vercel `icn1`. Do this before launch; every request makes several database calls.
4. Crons are in `vercel.json`. Primary scheduling is Inngest (every 5 minutes for sending, every 10 for replies); the daily `/api/cron/outreach-tick` is only a safety net. Vercel Hobby limits crons to once a day and functions to a short duration, so use Pro for production.
5. Keep **`OUTREACH_SENDING_ENABLED` unset or `false`** until the pre-launch checklist below is done. While off, everything works except the final send.

## 5. Inngest (the queue)

1. Create an account at inngest.com and an app. Copy the **Event key** to `INNGEST_EVENT_KEY` and the **Signing key** to `INNGEST_SIGNING_KEY`; set `QUEUE_PROVIDER=inngest`.
2. After the first deploy, in the Inngest dashboard → Apps → Sync new app, enter `https://<your-domain>/api/inngest`.
3. You should see functions: `outreach-tick`, `outreach-send`, `outreach-poll-dispatch`, `outreach-poll`, `outreach-linkedin`, `outreach-health`, `system-ping`. Run `system-ping` once to confirm the round trip.
4. Swapping providers later: the registry in `lib/providers/queue/functions.ts` is backend-neutral; implement `QueueProvider` for another service and change `QUEUE_PROVIDER`.

## 6. Google Cloud OAuth (the candidate's Gmail)

1. console.cloud.google.com → create a project → **APIs & Services → Library**: enable the **Gmail API**.
2. **OAuth consent screen**: user type External; app name "Pilanilabs"; support email; your homepage; **privacy policy URL** (the app's `/privacy`, which must describe the mailbox access, below); authorised domain = your domain.
3. **Scopes**: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send` (sensitive) and `https://www.googleapis.com/auth/gmail.readonly` (**restricted**). The code asks for nothing else.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised redirect URI: `https://<your-domain>/api/connect/gmail/callback` (and `http://localhost:3000/api/connect/gmail/callback` for local testing with a real Google client). Copy the client id and secret to `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
5. While the consent screen is in **Testing** you can add up to 100 test users and use it for the pilot (tokens expire after 7 days in testing mode, so candidates must reconnect weekly). Public launch needs verification.

### Restricted-scope verification checklist (start early: it takes weeks)
Reading replies uses `gmail.readonly`, a restricted scope. Google requires:
- [ ] Domain verified in Google Search Console and listed as an authorised domain.
- [ ] Privacy policy that states: what Gmail data is accessed (only threads this app started, to detect replies and bounces), why, that it is not sold, not used for ads, **not used to train AI models**, that humans do not read it except with consent / for security, retention (a 300-character snippet), and how to delete it.
- [ ] A justification for each scope, and why a narrower scope is not enough (`gmail.metadata` cannot read bodies; reply classification needs the text).
- [ ] A screen-recording demo of the OAuth flow, showing the consent screen with the app name and the scopes, and the feature using each scope.
- [ ] Prepared answers on data storage, encryption at rest (token envelope encryption), access controls and incident response.
- [ ] A **security assessment (CASA, Tier 2)** by a Google-approved assessor, repeated **every year**. Budget cost and several weeks.
- [ ] Application submitted at least 4-8 weeks before public launch.
Adhere to the Google API Services User Data Policy (Limited Use): the app uses mail content only to provide the feature the user sees.

## 7. Contact data and email verification (decision 3)
Run the two-week bake-off from the spec with 50 real job links and measure the verified-contact hit rate in India. Ask each vendor in writing how its data is sourced (no scraped LinkedIn data). For the trial the adapters are **Hunter.io** (`lib/providers/contacts/hunter.ts`, `lib/providers/verify/hunter.ts`, decision D-53): create a Hunter API key, then set `CONTACT_DATA_API_KEY` and `EMAIL_VERIFY_API_KEY` (the same key), `CONTACT_DATA_PROVIDER=licensed` and `EMAIL_VERIFY_PROVIDER=licensed`. Another vendor means adding an adapter next to these and returning it from the two `index.ts` factories. For LinkedIn/Indeed job links, also implement `lib/providers/joblookup/index.ts` (`JOB_LOOKUP_PROVIDER=licensed`) or leave it and the app will ask the candidate to paste the description.

## 8. Pre-launch checklist
- [ ] Counsel has reviewed docs/PLAN.md section 8 (compliance), the opt-out flow, the privacy page and the EU/UK exclusion.
- [ ] Postal address field wording and CAN-SPAM footer approved.
- [ ] Migrations 0003 and 0004 applied to production; RLS verified (the `tests/db/rls.db.test.ts` shape).
- [ ] All required secrets set; the app boots in production without errors.
- [ ] Inngest synced and `system-ping` works; `/api/cron/outreach-tick` returns 200 with the bearer secret.
- [ ] A real Gmail test account: connect, send to yourself, **check the `X-Pilani-Send-Key` header survives in the Sent folder** (crash recovery depends on it), check threading of day-3 and day-7 follow-ups, check the opt-out link and the `List-Unsubscribe` button in Gmail.
- [ ] Send 20 internal campaigns with zero duplicate sends and a bounce rate under the pause threshold (phase-1 exit gate).
- [ ] Contact provider connected and a sample of 50 addresses spot-checked.
- [ ] `ADMIN_EMAILS` set; open `/admin` as an admin and as a non-admin (should 404).
- [ ] Pricing set in the admin console (`pricing` setting) once pilot costs are measured; payment processor connected (not included in this build).
- [ ] Monitoring: Sentry DSN (optional), Inngest failure alerts, Vercel log alerts.
- [ ] Finally set `OUTREACH_SENDING_ENABLED=true` in production.
