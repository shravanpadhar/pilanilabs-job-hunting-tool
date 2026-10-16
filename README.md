# Pilanilabs Job Hunting Tool

Upload a resume → get a ranked feed of fresh jobs from many sources → open any job → generate a resume tailored to it (never inventing facts) → apply on the original site → track everything on a Kanban board.

On top of the core flow it includes: **email / WhatsApp alerts**, **named saved searches**, **company pages** (open roles, funding stage, community reviews), a **Hidden jobs feed** read straight from Greenhouse / Lever / Ashby career pages, an **ATS score checker**, and a **referral finder** that drafts polite LinkedIn outreach for you to send yourself.

Stack: Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 + shadcn-style components · Supabase (Postgres, Auth, Storage) · Prisma 7 · Anthropic Claude · Zod · Vitest + Playwright.

---

## Quick start (no API keys needed)

You need Node 20.16+ (22+ recommended) and a PostgreSQL database.

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```ini
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pilanilabs   # any Postgres; create the DB as UTF8
DEV_AUTH_BYPASS=true     # skip Supabase; sign in as a local dev user (ignored in production)
```

```bash
npm run db:deploy        # apply migrations
npm run db:seed          # ~40 sample jobs + 30 company profiles
npm run fetch-jobs       # optional: pull live jobs from the free sources (no keys required)
npm run dev              # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` the app still works end to end: resumes are parsed by a simple offline parser and jobs are ranked by keyword/title/location overlap. AI-only features (tailoring, cover letters, referral drafts, AI match scoring) show a friendly "not configured" message.

> **Database encoding:** create the database as UTF-8 (`CREATE DATABASE pilanilabs ENCODING 'UTF8' TEMPLATE template0;`). Job descriptions contain emoji and non-Latin text; Supabase is UTF-8 already.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm test` | Vitest unit tests (69 tests) |
| `npm run test:e2e` | Playwright happy path on desktop and 375px (needs a migrated + seeded DB; sets `DEV_AUTH_BYPASS` itself). First time: `npx playwright install chromium` |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Prisma migrate dev / migrate deploy / seed |
| `npm run fetch-jobs [-- --only=remotive,greenhouse --days=14 --match]` | Admin script: fetch every enabled source, dedupe, store (`--match` also refreshes every user's matches) |
| `npm run send-alerts [-- --force]` | Send due alert digests now |

## Environment variables

Everything is documented inline in [`.env.example`](.env.example). Summary and where to get each value:

| Variable | Needed for | Where to get it |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Everything | Supabase → Project Settings → Database → connection strings (pooled `:6543` for the app, direct `:5432` for migrations) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Auth + private resume storage | Supabase → Project Settings → API. The service-role key is server-only |
| `ANTHROPIC_API_KEY` | Parsing, AI scoring, tailoring, cover letters, referrals | <https://console.anthropic.com> → API keys |
| `RAPIDAPI_KEY` | JSearch (Google for Jobs: LinkedIn, Naukri, Indeed, Glassdoor…) | <https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch> → subscribe (free tier available) |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adzuna (India `in` and 13 other countries) | <https://developer.adzuna.com/> |
| `CRON_SECRET` | Protects `/api/cron/*` | `openssl rand -hex 32` |
| `RESEND_API_KEY`, `RESEND_FROM` | Email alerts | <https://resend.com/api-keys> (verify a sending domain) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_CONTENT_SID` | WhatsApp alerts | Twilio Console → Messaging → WhatsApp. Business-initiated messages need an approved template (`CONTENT_SID`, one variable `{{1}}`); the sandbox accepts free text after the recipient sends its join code |

Remotive, RemoteOK, Arbeitnow, Jobicy, Greenhouse, Lever and Ashby need **no key**.

## Free AI with OpenRouter (instead of a paid Anthropic key)

1. Create a key at <https://openrouter.ai/keys>.
2. Set `AI_PROVIDER=openrouter` and `OPENROUTER_API_KEY=...` (in `.env.local` and on Vercel). Leave `ANTHROPIC_API_KEY` empty.
3. Defaults are free NVIDIA Nemotron models with a Gemma 4 fallback (`config/ai.ts`); override with `OPENROUTER_MODEL_QUALITY` / `OPENROUTER_MODEL_FAST` (comma-separated = fallback chain). Check <https://openrouter.ai/models?max_price=0> for what is currently free — the list changes.

What to expect: free models are slower, rate-limited (small per-minute and per-day quotas for the whole app, not per user) and less accurate than Claude. Resume parsing falls back to the offline parser if the AI fails, tailored resumes are still verified against your original in code, and AI scoring of the job feed is on by default (it can burn through free quotas quickly — set `AI_MATCH_SCORING=false` to switch it off). Free endpoints may log prompts — check each model's data policy on OpenRouter before using real resumes.

## Sign-in: email works in any browser, plus Google

**Cross-browser email sign-in.** The email contains both a link and a 6-digit code, and the login page accepts the code, so people can open the email on another device or browser. For the link to work in any browser, update two Supabase email templates (Authentication → Emails → Templates): **Magic Link** *and* **Confirm signup** (new users get the latter). Paste:

```html
<h2>Sign in to Pilanilabs</h2>
<p>Your sign-in code: <strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">click here to sign in</a> — in any browser.</p>
```

(Some company mail scanners open links before the person does and use up the one-time link; the code always still works.)

**Google sign-in for everyone.**
1. Google Cloud Console → APIs & Services → **OAuth consent screen**: create the app, then click **Publish app** so its status is **In production**. While it says "Testing", only listed test users can sign in — the usual reason "others can't log in".
2. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Sign In / Providers → **Google**: enable, paste the client ID and secret, save.
4. Supabase → Authentication → URL Configuration: Site URL = your app URL; Redirect URLs include `https://<your-app>/**`.

## Setting up Supabase

1. Create a project. Copy the URL, anon key, service-role key and the two database connection strings into `.env.local`.
2. **Auth → URL Configuration:** set *Site URL* to your app URL and add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to *Redirect URLs*.
3. **Auth → Providers:** Email (magic link) is on by default. For Google, enable the provider and paste a Google OAuth client ID/secret.
4. Run `npm run db:deploy`. Migration `0002_rls` enables Row Level Security on Supabase (users can only read their own resumes, matches, tailored resumes and applications). It is a no-op on plain Postgres.
5. Storage needs no setup: the private `resumes` bucket is created on first upload and files are only ever served through short-lived signed URLs.

> Prisma connects with the database owner role, which bypasses RLS — the app itself scopes every query by the signed-in user. RLS is the second line of defence for anything that reaches Postgres through Supabase's public API.

## Job sources

| Source | Key? | Notes |
|---|---|---|
| JSearch (RapidAPI) | `RAPIDAPI_KEY` | Aggregates Google for Jobs. The original publisher is shown ("via JSearch · originally on LinkedIn"). One page per query to protect the free quota |
| Adzuna | `ADZUNA_*` | Descriptions are truncated snippets; "Jobs by Adzuna" attribution in the footer |
| Remotive | none | Their terms require linking back and naming Remotive, so apply links go to the Remotive URL. They ask for few requests per day — the 6-hourly cron makes 4 |
| RemoteOK | none | Terms require a followed link back and naming "Remote OK" (done); we don't use their logo |
| Arbeitnow | none | Europe-heavy, many remote roles |
| Jobicy | none | Terms require credit + sending applicants to the feed URL (done); asks for ≤ ~1 request/hour |
| Greenhouse / Lever / Ashby | none | Public board APIs for the companies in [`config/companies.ts`](config/companies.ts) (every slug was verified live) plus any boards users add on the Hidden jobs page |

LinkedIn, Naukri, X/Twitter and Wellfound are **not** scraped and no login automation exists anywhere in the code. A failing source is logged and skipped; it never breaks the feed.

## Deploying to Vercel

1. Push the repo and import it in Vercel. Framework preset: Next.js. `npm run build` runs `prisma generate` automatically.
2. Add every variable from `.env.example` in *Project → Settings → Environment Variables* (do **not** set `DEV_AUTH_BYPASS`). Set `NEXT_PUBLIC_APP_URL` to your production URL.
3. Run migrations once against production: `DIRECT_URL=… npx prisma migrate deploy` (locally or in CI).
4. Crons are declared in [`vercel.json`](vercel.json): job refresh every 6 hours (`0 */6 * * *`) and alerts daily at 03:30 UTC = 09:00 IST. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
   - **Plan limits:** Hobby plans only run crons once a day and cap function duration lower than the 300 s these routes request. On Hobby, change the refresh schedule to daily or trigger `/api/cron/refresh-jobs` from GitHub Actions / any scheduler with the bearer header.
5. Trigger the first fetch: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/refresh-jobs`.

## How it fits together

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, the matching engine, the anti-fabrication guard, and how to add a new job source.

## Verification status (be aware of what was and wasn't exercised)

Verified in this repository: `npm run lint`, `npm run build`, `npm test` (69 unit tests) and `npm run test:e2e` (8 Playwright runs on desktop + 375px, no horizontal scroll) all pass. Migrations, seed, live fetching from Remotive, RemoteOK, Arbeitnow, Jobicy, Greenhouse, Lever and Ashby (≈2,600 real jobs), dedupe, two-stage matching, the REST API surface, PDF/DOCX export and text extraction were run against a real PostgreSQL 18.

**Not exercised** (no credentials were available): a live Anthropic call (the AI layer is tested against a local fake Messages API through the real SDK — request shape, retry-on-invalid-JSON, refusals, error mapping, usage logging), Supabase Auth/Storage/RLS on a real Supabase project, JSearch, Adzuna, Resend and Twilio. Do a smoke test of each once your keys are in.

## Design notes and deviations

- **Prisma 7.10** (not the 8.0 release candidate that currently carries the `latest` tag): uses `prisma.config.ts`, the `prisma-client` generator (output in `generated/`, git-ignored) and the `pg` driver adapter.
- **Stage-1 keeps the top 200** matches (not 50) so infinite scroll has depth; Claude Haiku re-scores the best 50 and results are cached in `Match` (re-scored only when the profile changes).
- **Brand:** Playfair Display headings, Inter body, gold `#B9832C` / navy `#021C3D` / cream `#F6F5F1`, 6 px buttons, 12 px inputs. Inputs are light in light mode and use the brand's dark input colours (`#0F1932`) in dark mode. White text on the brand gold is ~3.3:1 — fine for the semibold 14–16 px buttons used here but under AA for small text; to get AA, set `--primary-foreground: #021c3d` in `app/globals.css`. Gold *text* uses a darker `--gold-ink` to stay readable.
- **Company facts** (`config/company-profiles.ts`) are hand-curated, coarse and dated. Glassdoor/LinkedIn/Crunchbase data is not scraped (their terms forbid it); the page links out instead, and shows reviews written by this app's users.
- `AGENTS.md` is generated by `next dev` (Next.js 16 feature).
