# What you have to do

Everything that needs a decision, an account, a key or a real-world check. Nothing below could be done from inside the repo.
Details for each step: [OUTREACH-SETUP.md](OUTREACH-SETUP.md). Every assumption I made: [DECISIONS.md](DECISIONS.md) (items marked with a warning sign need your yes/no).

## A. Do first (blocks everything real)
1. **Apply the database migrations to Supabase yourself.** I never touched your Supabase. Run `npx prisma migrate deploy` with your `DIRECT_URL`. Until you do, the deployed app's job feed and several pages will error, because they now use the new `Job.ownerUserId` column. New migrations: `0003_outreach_core`, `0004_outreach_rls` (additive, safe).
2. **Generate 4 secrets** (`openssl rand -hex 32` each): `TOKEN_ENCRYPTION_KEY`, `SUPPRESSION_HASH_KEY`, `OPT_OUT_SIGNING_KEY`, plus your existing `CRON_SECRET`. Store them in Vercel and a password manager. Back up `SUPPRESSION_HASH_KEY`: if it is lost the do-not-contact list stops working.
3. **Rotate any key that was ever pasted in a chat or screenshot** (your spec rule). Your `.env.local` already holds live Anthropic/OpenRouter keys and a Supabase password: keep it out of git (it is ignored) and never paste it anywhere.
4. Merge branch `feat/career-platform` after your review (nothing is pushed or merged; `main` is untouched).

## B. Accounts to create
| Account | For | Cost note |
|---|---|---|
| **Inngest** | the background queue (sender, reply poller, reminders) | free tier is enough for a pilot |
| **Google Cloud project** with Gmail API + OAuth consent screen | the candidate's own Gmail | free; **verification of the restricted scope + an annual security assessment (CASA) is the long pole: start now, allow weeks** |
| **Contact-data provider** and **email-verification provider** | finding the people and checking emails | per-lookup cost; run the 2-week, 50-link India bake-off from the spec |
| Payment processor (e.g. Razorpay for India / Stripe) | selling credits | not built, see C3 |
| Optional: Sentry | error reporting | |

## C. Code only you can finish (I left clearly marked stubs)
1. **Contact data and email check (Hunter.io adapters now written, D-53).** Create a Hunter API key and set `CONTACT_DATA_API_KEY` and `EMAIL_VERIFY_API_KEY` (the same key), plus `CONTACT_DATA_PROVIDER=licensed` and `EMAIL_VERIFY_PROVIDER=licensed`. They have only been tested against mocked answers, so try a few real searches before relying on them. For a different vendor, add an adapter in `lib/providers/{contacts,verify}/`.
2. `lib/providers/joblookup/index.ts` (optional): a licensed job lookup for LinkedIn/Indeed links. Without it the app asks the candidate to paste the description (works today).
3. **Real payments**: credits, trial and ledger work, but buying is a fake gateway and is refused in production. Choose a processor and implement a checkout + webhook that calls `grantCredits(...)`.
4. Set real prices in the admin console (`pricing` setting), after the pilot measures the cost of one campaign. Defaults are placeholders (5 free credits, 1 credit per person).

## D. Verify with the real thing before switching sending on
Tests use fakes, so these were **not** exercised live:
- Gmail: connect a real account, send to yourself, check the attachment, the footer, the opt-out link, the one-click unsubscribe, day-3/day-7 threading, and that the `X-Pilani-Send-Key` header survives in Sent mail (crash recovery depends on it).
- Inngest: sync `https://<domain>/api/inngest`, run `system-ping`, watch the 5-minute tick send.
- The Workable job reader against a live Workable job page.
- Run 20 internal campaigns: zero duplicate sends, bounce rate under the pause threshold (phase-1 exit gate in the spec).
- Use `npm run eval:fabrication -- --live` with your real AI key to check drafts; grow the golden set toward ~200 reviewed pairs.

## E. Decisions I need from you (defaults in brackets)
1. Postal address required from every candidate [yes: required before any send].
2. Keep teal `#0E8A7D` buttons or darken to `#0B7A6E` for accessibility [kept as specified; ~4.4:1 with white text].
3. A "my own words" override for the fact-checker, or keep it strict [strict].
4. Any reply, including out-of-office, stops the sequence [yes, as the spec says].
5. Region: Vercel `icn1` to sit beside your `ap-northeast-2` Supabase, or move Supabase to Mumbai for India-hosted data [not set].
6. Logo: the supplied PNG is low resolution; send a vector or 2x file.
7. Have **counsel review** docs/PLAN.md section 8, the opt-out flow, the privacy page (must mention Gmail access, no AI training, 300-character snippets), the EU/UK exclusion, and keeping hashed audit entries after account deletion.

## F. Final switch
Set `OUTREACH_SENDING_ENABLED=true` in Vercel only after A to E are done. It is off by default in production, so you can deploy the workspace first and turn outreach on later.

## G. Not built (outside this scope)
Autopilot levels (B11), interview prep (B12), Outlook mailbox, coach/college accounts (B14), installable PWA (C4), Sentry wiring, a real contact/verification provider, a payment processor.
