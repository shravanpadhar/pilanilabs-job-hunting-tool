# Pilanilabs Career Platform — Implementation Plan

Status: **Phase 0 (audit and plan) — awaiting approval. No application code has been changed.**
Source of truth: `docs/Pilanilabs-Career-Platform-Product-Spec.pdf` (the prompt calls it `docs/SPEC.pdf`; the file is kept under its original name — see DECISIONS D-01). Where the build prompt and the spec disagree, the prompt wins and the difference is logged in `docs/DECISIONS.md`.

Baseline verified today on `main` (commit `5990c0f`): `tsc --noEmit` clean, `eslint .` clean, **79 / 79 unit tests pass**. E2E (8 runs) was **not** run — it needs a migrated Postgres and none is running here (open question Q1).

---

## 1. Ground rules for the whole build

1. **Extend, don't rebuild.** Everything below is additive. The only edits to existing modules are small and listed per phase.
2. **Fakes first.** Every external service sits behind an interface with a fake implementation. With zero keys, the app and every test run locally. Real adapters are selected by env (`*_PROVIDER`), and in production a missing real key fails the startup check loudly.
3. **Safety rules are code, not prompts.** Approval hash, suppression, stop-on-reply, caps and region filter are deterministic checks that run *at send time*, regardless of what any model produced.
4. **AI never decides recipients and never sends.** AI output is Zod-validated, one corrective retry, then a clear error or deterministic fallback. Job pages, contact profiles and replies are wrapped as untrusted data.
5. **One phase = one branch commit series.** After each phase: typecheck, lint, unit, e2e → commit → short summary → **stop for your review**.
6. Branch: all work happens on `feat/career-platform` (never on `main`).
7. `AGENTS.md` says this Next.js 16 differs from training data: before writing route/proxy/instrumentation code I read the relevant guide under `node_modules/next/dist/docs/`.

---

## 2. Audit: existing modules → spec requirements

Legend: ✅ done · 🟡 partly / needs extension · ❌ new.

### A. Search workspace

| ID | Requirement | Status | Where it lives today | Gap / change |
|---|---|---|---|---|
| A1 | Resume upload, AI parse, editable profile, prefs | ✅ | `lib/resume/*`, `lib/ai/parse-resume.ts`, `components/onboarding/*`, `app/api/resume/*`, `app/api/preferences` | Add outreach profile step (sender name, postal address, time zone, mailbox) to onboarding (Phase 4) |
| A2 | Multi-source feed, dedupe, two-stage matching | ✅ | `lib/sources/*`, `lib/jobs/*`, `lib/matching/*` | Add "Reach out" action; exclude private (user-pasted) jobs from the shared feed (D-05) |
| A3 | Hidden jobs, user-added boards | ✅ | `lib/jobs/hidden.ts`, `app/api/boards`, `config/companies.ts` | Reuse `parseBoardUrl` in link intake; add Workable reader |
| A4 | Tailored resume + cover letter, no-fabrication, PDF/DOCX | ✅ | `lib/ai/tailor-resume.ts`, `lib/resume/verify.ts`, `render-pdf.tsx`, `render-docx.ts` | Reuse for campaigns; PDF attached to emails (Phase 3/4). `TailoredResume.jobId` stays required → private Job rows (D-05) |
| A5 | ATS checker | ✅ | `lib/resume/ats.ts`, `app/ats` | none |
| A6 | Tracker shows outreach status | 🟡 | `app/tracker/page.tsx`, `components/tracker/kanban-board.tsx` | "Outreach active" badge + link to thread (Phase 5) |
| A7 | Saved searches + alerts | ✅ | `lib/alerts/*`, `app/api/cron/send-alerts` | Reuse `lib/alerts/channels.ts` for reply notifications; fakes for Resend/Twilio added |
| A8 | Company pages (v2) | ✅ | `app/companies/*`, `config/company-profiles.ts` | Campaign `companyId` points at `CompanyProfile` (stub row if absent) |

### B. Outreach engine

| ID | Requirement | Status | Phase | Notes |
|---|---|---|---|---|
| B1 | Paste link / "Reach out" from feed; extract job | ❌ (reuses `fetchJson`, `normalize.ts`, `board-url.ts`) | 2 | Greenhouse, Lever, Ashby, Workable public APIs → JSON-LD → text+AI extraction. LinkedIn/Indeed → licensed lookup or paste |
| B2 | Resolve company, identify targets | ❌ | 2 | Rules-first ranking, AI only breaks ties among provider-returned people |
| B3 | Contact discovery + verification, source + confidence | ❌ | 2 | `ContactDataProvider`, `EmailVerifier`; fake + clearly marked stub |
| B4 | Approved drafts: 1 email + 1 LinkedIn note per target | ❌ (pattern from `lib/ai/referral.ts`, `callJson`) | 3 | Message verifier reuses `verify.ts` approach |
| B5 | Sequence day 0/3/7, time zones, caps | ❌ | 3 (schedule) / 4 (sender) | |
| B6 | Send from candidate's Gmail, resume attached | ❌ | 3 (attachment) / 4 | `MailboxProvider` (Gmail now, Graph later) |
| B7 | Reply/bounce/unsub detection, classify, notify | ❌ | 5 | Rules override the model |
| B8 | LinkedIn: connect first, message after acceptance | ❌ | 6 | **Assisted mode only** |
| B9 | Outreach inbox | ❌ | 5 | |
| B10 | Suppression list, opt-out | ❌ | 1 (list) / 4 (opt-out line + route) | |
| B11 | Autopilot levels (v2) | ⏸ | — | Enum field exists; only `REVIEW_ALL` is implemented |
| B12 | Interview prep (v2) | ⏸ | — | Out of scope |
| B13 | Outcome tracking / insights | ❌ | 7 | No open-tracking pixels (D-14) |
| B14 | Coach/college accounts (Later) | ⏸ | — | Out of scope |

### C. Platform

| ID | Requirement | Status | Phase |
|---|---|---|---|
| C1 | Billing: free workspace, outreach credits | ❌ | 7 (ledger, trial, config, fake gateway; real payments = Q2) |
| C2 | Admin console | ❌ | 7 |
| C3 | Audit log | ❌ | 1 (helper) / used everywhere |
| C4 | Mobile-first PWA (v2) | 🟡 | Mobile-first UI + 375 px e2e (Phase 8); installable PWA deferred |

Existing infrastructure being reused: `callJson` (Zod, one retry, `AiUsage`), `assertAiQuota`, `handler()/AppError`, `requireUserApi`, `assertCron`, `storage.ts`, `alerts/channels.ts`, `logger.ts`, `fetchJson`, `verify.ts` (no-fabrication), `render-pdf.tsx`.

---

## 3. Architecture additions

```
lib/
  providers/                 # every external service: interface + fake + real adapter
    queue/      QueueProvider        inngest.ts · inline.ts(fake) · events.ts (Zod event schemas)
    mailbox/    MailboxProvider      gmail.ts · fake.ts           (outlook.ts stub, v2)
    contacts/   ContactDataProvider  fake.ts · licensed-stub.ts   (clearly marked, throws NotConfigured)
    verify/     EmailVerifier        fake.ts · licensed-stub.ts
    joblookup/  JobLookupProvider    jsearch.ts (existing key) · fake.ts      # LinkedIn/Indeed links
    notify/     Notifier             resend+twilio (existing channels) · fake.ts
    payments/   PaymentProvider      fake.ts                                   # real one = Q2
    index.ts    provider factory: env → real | fake; production + missing key = startup error
  crypto/envelope.ts         # AES-256-GCM envelope encryption (TOKEN_ENCRYPTION_KEY, key id, rotation)
  audit.ts                   # AuditEvent helper (no plaintext emails in `detail`)
  compliance/
    suppression.ts           # normalise + HMAC-hash email, check/add, bulk check
    regions.ts               # EU/EEA/UK exclusion, country → time zone
    optout.ts                # signed opt-out tokens, footer text
  outreach/
    intake/                  # url safety (SSRF guard), ATS readers, JSON-LD, text+AI extract
    company.ts               # resolve + one-touch-per-company-per-30-days
    targets.ts               # rank, discover, verify, confidence gating
    draft.ts verify-message.ts schedule.ts approval.ts
    send.ts policy.ts warmup.ts health.ts sequence.ts
    replies.ts classify.ts rules.ts
    linkedin.ts              # LinkedInStep state machine
  billing/ credits.ts pricing.ts cost.ts
  admin/ guard.ts queries.ts
config/ outreach.ts regions.ts pricing.ts ai-pricing.ts
app/
  outreach/ (inbox) · outreach/new · outreach/[campaignId]
  insights · admin/* · u/[token] (public opt-out)
  api/outreach/* · api/connect/gmail/{start,callback} · api/inngest · api/admin/*
instrumentation.ts           # production env validation at server start
evals/                       # fabrication golden-set harness (Phase 8)
```

### Queue (Decision 4)
**Inngest** behind `QueueProvider` (`send(event)`, function registry). It runs on Vercel serverless via `/api/inngest` (signed), gives retries, step durability, and cron without Vercel's Hobby cron limit. **The database stays the source of truth for the schedule** (`OutreachMessage.scheduledAt`); a 5-minute Inngest cron "tick" finds due messages and fans out one `outreach/send.requested` event per message. No long sleeps, so a lost event only delays a send until the next tick. Fake = in-process inline runner (same function bodies, called directly) used by tests and local dev with no Inngest server. A `/api/cron/outreach-tick` route (bearer `CRON_SECRET`) is kept as a once-a-day fallback.

### Send idempotency ("never twice")
- `OutreachMessage` unique `(targetId, channel, step)` — a step can't be duplicated.
- `OutreachMessage.sendKey` **unique**, set at approval = `sha256(messageId | approvedTextHash)`.
- Atomic claim: `UPDATE … SET state='SENDING', claimedAt=now() WHERE id=$1 AND state='SCHEDULED'` — exactly one worker wins (`updateMany` count = 1).
- Deterministic RFC `Message-ID` derived from `sendKey`. If a claim is older than 10 min (worker died mid-send) the recovery path first searches the mailbox Sent folder for that Message-ID: found → mark `SENT`; not found → safe to resend.
- Two-worker race, crash-after-send, and retry tests are required unit tests.

### Approval (non-negotiable)
`approvedTextHash = sha256(canonical JSON { channel, step, to, subject, body-as-sent (incl. footer), attachmentSha256 })`. Edits to any of these after approval clear `approvedAt/approvedTextHash/sendKey` and drop the message to `DRAFT`. The sender recomputes the hash from what it is about to send and refuses on mismatch. The approve endpoint re-runs the verifier, suppression, region and verification checks.

### Send-time policy (`policy.ts`) — every check runs again at send
campaign `ACTIVE` · target not terminal · mailbox `ACTIVE` · sending not paused (user or auto) · global kill switch `OUTREACH_SENDING_ENABLED` · hash matches · recipient not on suppression list · region allowed · inside recipient working hours (else reschedule, don't fail) · mailbox daily cap × warm-up multiplier · minimum spacing + jitter between sends · per-recipient (one step per ≥2 days) · per-company (max 3 targets per campaign; one campaign per company per 30 days) · no reply/bounce on the target.

### Warm-up and health
Warm-up by days since connect (config): 5/day → 10 → 20 → min(user cap, hard max 30; absolute ceiling configurable). Auto-pause when, over the last 7 days with a minimum sample, **bounce rate > 5 %** or **complaint rate > 0.3 %** (or ≥ 2 complaints). Pause holds scheduled mail (does not delete it), notifies the candidate, and needs admin/user resume. All thresholds in `config/outreach.ts`.

### Replies
Poller (Inngest cron, 10 min) reads only **threads we started** via Gmail `history.list` cursor. Order of operations: (1) store `Reply` (unique `providerMessageId`), (2) **rule layer first** — bounce DSN, auto-reply headers, unsubscribe/hostile phrases — which stops the sequence and suppresses whatever the model later says, (3) cancel every pending message and LinkedIn prompt for that target, (4) classify with the fast model only if no rule fired (reply text is untrusted data, output Zod-validated), (5) notify, (6) generate a suggested response for the candidate (shown, **never sent**).

### Security
- Mailbox refresh tokens: envelope encryption (random per-token data key wrapped by `TOKEN_ENCRYPTION_KEY`, key-id prefix for rotation), decrypted only inside the mailbox adapter, never logged, never selected by default (`select` omits the column); revoked on disconnect and on account deletion.
- Gmail scopes: `openid email`, `gmail.send` (sensitive) and `gmail.readonly` (restricted, for reply detection). Requested incrementally via `include_granted_scopes`; no model training on mail content; reply bodies are not stored beyond a 300-character snippet.
- Public opt-out `/u/[token]`: HMAC-signed token, confirmation page + one-click POST (also wired to `List-Unsubscribe` / `List-Unsubscribe-Post`).
- SSRF guard for pasted links: https only, no credentials in URL, DNS-resolved IP must be public, no redirects to private ranges, 2 MB / 10 s caps, no cookies.
- Admin: allow-list (`ADMIN_EMAILS`), every admin page/API call writes an `AuditEvent`.
- Env: `lib/env.ts` getters + a Zod `validateEnv()` run from `instrumentation.ts` at server start (skipped during `next build`, so `npm run build` works without secrets). Only `NEXT_PUBLIC_*` reach the client; a unit test greps the client bundle config/imports for server-only env names.

---

## 4. Prisma schema additions (migrations `0003`, `0004`, later `0005+`)

New enums: `ConnectedProvider(GMAIL, OUTLOOK)`, `ConnectedStatus(ACTIVE, REVOKED, ERROR)`, `CampaignMode(REVIEW_ALL, APPROVE_FIRST, AUTO)`, `CampaignStatus(DRAFT, ACTIVE, PAUSED, COMPLETED, CANCELLED)`, `TargetRole(HIRING_MANAGER, TEAM_LEAD, RECRUITER, WARM_PATH)`, `EmailVerification(VALID, RISKY, INVALID, UNKNOWN)`, `TargetState(DISCOVERED, VERIFIED, DRAFTED, APPROVED, SCHEDULED, SENT, REPLIED, BOUNCED, OPTED_OUT, COMPLETED, CANCELLED)`, `MessageChannel(EMAIL, LINKEDIN_NOTE, LINKEDIN_MESSAGE)`, `MessageState(DRAFT, APPROVED, SCHEDULED, **SENDING**, SENT, FAILED, CANCELLED)`, `LinkedInState(NOT_STARTED, CONNECT_PENDING, ACCEPTED, MESSAGED, WITHDRAWN)`, `MarkedBy(USER, SYSTEM)`, `ReplyClass(INTERESTED, REFERRAL, NOT_NOW, NO, OUT_OF_OFFICE, UNSUBSCRIBE, OTHER)`, `SuppressionReason(OPT_OUT, BOUNCE, COMPLAINT, MANUAL)`, `CreditReason(PURCHASE, SPEND_TARGET, SPEND_VERIFY, REFUND, REPLY_BONUS, **TRIAL_GRANT**, **ADJUSTMENT**)`.
(Bold = additions beyond spec section 13, logged in DECISIONS.)

Tables (all spec section 13 tables, plus the few additions):

| Table | Notes |
|---|---|
| `ConnectedAccount` | spec columns; unique `(userId, provider, accountEmail)`; `encryptedRefreshToken`; **+`syncCursor`** (Gmail historyId), `lastSyncAt`, `lastError`. FK cascade on user |
| **`OutreachProfile`** (new) | `userId` pk; sender display name, postal address, `timeZone`, notification prefs, `sendingPausedAt`, `pauseReason`, region allow-list override (default none), `costCeilingMicros` override |
| `OutreachCampaign` | spec columns; **+`companyKey`** (slug, for the 30-day rule), **+`companyType`** (bucket for insights); index `(userId, status)`; index `(userId, companyKey, createdAt)` |
| `OutreachTarget` | spec columns; **+`country`**, **+`riskAcknowledgedAt`** (explicit decision for below-threshold/risky), **+`emailHash`** (suppression lookup without re-reading email); index `(campaignId, state)` |
| `OutreachMessage` | spec columns; **+`sendKey` unique**, **+`claimedAt`**, **+`attempts`**, **+`lastError`**, **+`templateKey`**, **+`attachmentSha256`**; unique `(targetId, channel, step)`; index `(scheduledAt, state)` |
| `LinkedInStep` | spec columns; unique `targetId` |
| `Reply` | spec columns; **+`providerMessageId` unique**, **+`ruleHit`** (which deterministic rule fired) |
| `SuppressionEntry` | `emailHash` unique, reason, createdAt. **No FK to User** — survives deletion |
| `AuditEvent` | spec columns; **no FK to User**; `detail` never holds plaintext emails; index `(userId, createdAt)`, `(entityType, entityId)` |
| `CreditLedger` | spec columns; unique `(userId, reason, refType, refId)` to make spends idempotent |
| `ProviderUsage` | spec columns; index `(userId, createdAt)` |
| `AppSetting` (Phase 7) | `key` pk, `value` JSON — admin-editable pricing/caps over config defaults |
| `Job.ownerUserId` (column) | nullable; `null` = shared (D-05) |
| `AiUsage.costMicros` (column) | nullable int for cost tracking |

Cascade rules: every user-owned table cascades on user delete **except** `SuppressionEntry` and `AuditEvent` (no relation at all). Account deletion also revokes mailbox tokens (Phase 4 hook) and scrubs PII from `AuditEvent.detail` (kept: opaque user uuid, action, ids, hashes).

### RLS (migration `0004_outreach_rls`, same no-op-off-Supabase guard as `0002`)
- Owner-scoped **read-only** for the authenticated role: `OutreachProfile`, `OutreachCampaign`, `OutreachTarget`/`OutreachMessage`/`Reply`/`LinkedInStep` (via `EXISTS` on the campaign's `userId`), `CreditLedger`. All writes go through the server — so the public Supabase API can never create an approval record, change a recipient, or grant credits.
- `ConnectedAccount`: **no policy** (token column must never be reachable from the public API); the app exposes a safe projection.
- `SuppressionEntry`, `AuditEvent`, `ProviderUsage`, `AppSetting`: RLS enabled, **no policies** (service role only).
- `Job`: read policy changed to `ownerUserId IS NULL OR ownerUserId = auth.uid()`.

---

## 5. Phases

Each phase ends with: `tsc`, `eslint`, `vitest`, `playwright`, commit(s) on `feat/career-platform`, a short summary + "how to test", then **stop**.

### Phase 0 — Audit and plan (this document)
Deliverables: `docs/PLAN.md`, `docs/DECISIONS.md`, `CLAUDE.md`. Awaiting your approval and answers to §8.

### Phase 1 — Foundation
- Prisma schema + `0003_outreach_core`, `0004_outreach_rls` (above); `Job.ownerUserId`; `AiUsage.costMicros`.
- `lib/env.ts` getters for every new variable; `lib/env-check.ts` (Zod `validateEnv()`), `instrumentation.ts`; **`.env.example` complete** (all spec §12 variables as placeholders + new ones). Secrets never logged (logger redaction test).
- Provider factory + `QueueProvider` (Inngest + inline fake), `/api/inngest` route, event schemas.
- `lib/crypto/envelope.ts` + `ConnectedAccount` repository (store/read/rotate/revoke; no OAuth yet).
- `lib/audit.ts`; `lib/compliance/suppression.ts` (normalisation incl. Gmail dot/plus handling **not** applied — exact lowercase address plus domain-level `MANUAL` entries, see D-09).
- Account deletion extended (keep suppression, scrub audit detail).
- Design tokens re-skin (Fraunces/Inter, new palette, button/input styles, logo asset) — isolated commit so visual regressions are separable (D-12).
- Tests: envelope round-trip/tamper/rotation, suppression hashing/lookup, audit PII scrub, env check (production fails on missing secret; dev OK), queue fake delivers/retries, RLS migration applies on plain Postgres (no-op) and a Supabase-shaped test schema.
- Exit: all 79 existing tests + new ones green; `npm run build` works with no secrets.

### Phase 2 — Intake and targets (B1–B3)
- Intake: `POST /api/outreach/intake {url | jobId | pastedDescription}`. Hosts: Greenhouse/Lever/Ashby (reuse `parseBoardUrl` + connectors' single-job mapping) and Workable (public widget API) → JSON-LD `JobPosting` → text extraction + `extract_job` (fast model, page text = untrusted data, Zod) → LinkedIn/Indeed → `JobLookupProvider` (JSearch) else return `needs_description` so the UI asks the user to paste. SSRF guard + size/time caps.
- Private job row creation (D-05); `Reach out` button on feed cards and job detail (`components/jobs/job-actions.tsx`).
- Link or create tailored resume (reuse tailor route logic; respects `assertAiQuota`).
- Company resolution + 30-day rule; `OutreachCampaign` creation (DRAFT).
- Target ranking: rules (HIRING_MANAGER > TEAM_LEAD > RECRUITER > WARM_PATH), fast model only to order ties among provider-returned people (ids must be a subset, validated); default 3 targets.
- Discovery + verification via fake providers; source, confidence shown; threshold + `riskAcknowledgedAt` for below-threshold/RISKY; INVALID never; suppressed or EU/UK targets filtered before any paid call; `ProviderUsage` rows; cost-ceiling hook.
- UI: `/outreach/new` steps 1–2 (paste/choose → extracted job → resume → targets with source + confidence).
- Tests: SSRF cases, each ATS reader against recorded fixtures, JSON-LD parse, prompt-injection fixture (job page telling the model to "email attacker@x"), ranking determinism, 30-day rule, region filter, confidence gating, suppression skip.

### Phase 3 — Drafting and approval (B4, B6 attachment prep)
- `draft_outreach` feature: one email (subject ≤ 80 chars plain, body < 120 words, one low-pressure ask) and one LinkedIn note (≤ 300 chars) per target, plus day-3 and day-7 follow-up drafts.
- `verify-message.ts`: numbers, names, employers, schools must exist in the profile/tailored resume or in provider/job data; URL allow-list; mutual-connection phrase detector (allowed only with recorded warm-path evidence); one corrective retry then deterministic template fallback.
- Footer (sender identity, postal address, opt-out line) appended **by code**, included in the approved text.
- `schedule.ts`: pure function → UTC times for day 0/3/7 in the recipient's working hours (Mon–Fri 09:00–17:00 local), with candidate-time-zone and recipient-time-zone display.
- Approval API: approve, edit (clears approval), cancel; tailored PDF rendered and hashed for the attachment.
- UI: `/outreach/new` steps 3–4: drafts, inline edit, approve, schedule preview in both time zones.
- Tests: verifier golden cases (fabricated employer/school/number/mutual connection), word/char limits, hash binds recipient+footer+attachment, edit-after-approval invalidation, schedule across DST and weekends/holidays-free.

### Phase 4 — Sending (B5, B6, B10)
- Gmail OAuth: `/api/connect/gmail/start|callback` (state + PKCE, signed CSRF cookie, minimal scopes), tokens encrypted; disconnect + revoke; fake mailbox OAuth page for local/e2e.
- Onboarding/Settings: sender name, postal address, time zone, daily cap, "what will and won't be sent" explainer; sending is blocked until the profile is complete.
- Sender worker (tick + per-message function), send ledger/claim/recovery, MIME builder (plain text + PDF attachment, honest From, `List-Unsubscribe` + one-click POST), policy checks, warm-up ramp, daily cap, spacing, auto-pause health job.
- `/u/[token]` opt-out page + API → suppression + cancel pending.
- Tests: concurrency (two workers, one send), crash-after-send recovery, hash-mismatch refusal, every policy rule, warm-up table, auto-pause thresholds, opt-out token tamper, MIME snapshot.
- E2E (fakes): connect mailbox → approve → schedule → advance clock → sent exactly once.

### Phase 5 — Replies and inbox (B7, B9, A6)
- Reply/bounce poller; rule layer; classifier; suggested response; notifications (email/WhatsApp, fakes available); stop-by-rule semantics.
- `/outreach` inbox: thread per job and person, status, next scheduled step, edit/cancel any unsent step, open thread in Gmail.
- Tracker: "Outreach active" badge + link; confirm-interview moves job to `INTERVIEWING`.
- Journey 4: sequence-complete state, result summary, offer next three targets.
- Tests: rules override a model that says INTERESTED; hostile/unsubscribe/bounce/OOO fixtures; reply injection fixture; idempotent poll; cancellation of pending messages.

### Phase 6 — LinkedIn assisted (B8)
- `LinkedInStep` state machine (pure transition table + guards) — NOT_STARTED → CONNECT_PENDING → ACCEPTED → MESSAGED, CONNECT_PENDING → WITHDRAWN; user-driven transitions, `markedBy`.
- UI: "Open profile" (provider-supplied URL or a plain LinkedIn search link; no scraping), copy note, "I sent it", "They accepted", post-acceptance message draft (same verifier), 14-day timer.
- Reminders (day 7, day 14 "withdraw and do not message"); system never claims acceptance.
- Tests: illegal transitions rejected, expiry math, reply/opt-out freezes the lane, no automation code path exists (a test asserts no LinkedIn HTTP client is imported).

### Phase 7 — Billing, admin, insights (C1–C3, B13)
- `CreditLedger` service (balance, idempotent spend/refund, trial grant), `AppSetting` + `config/pricing.ts` (nothing hard-coded), fake `PaymentProvider`, admin grants.
- `ProviderUsage` / `AiUsage.costMicros` capture; per-candidate cost ceiling enforced before paid calls.
- `/admin`: provider spend and margin per campaign, send health, complaints, suppression list (search by email → hash), audit log, abuse review (pause/resume). Admin allow-list; admin access logged.
- `/insights`: reply, referral, interview rates by template and company type.
- Tests: ledger races, refund rules, ceiling blocks, admin authorisation, insights aggregation.

### Phase 8 — Hardening and deploy
- E2E for the four journeys of spec §6 on desktop and 375 px (dev-only clock/fake-injection endpoints guarded by `EXTERNAL_FAKES`, impossible in production).
- `evals/` fabrication harness skeleton (golden-set schema, runner, fake and live model modes, zero-fabrication assertion; seeded with ~10 pairs, built to grow to 200).
- `vercel.json` (crons, region), `maxDuration`s, security headers review, `npm run build` clean.
- README: Supabase setup, Vercel env vars, Google Cloud OAuth step-by-step including the restricted-scope verification checklist, Inngest setup, pre-launch checklist. `docs/DECISIONS.md` finalised.

---

## 6. Testing strategy
- Keep all 79 existing tests green; add unit tests per module above (Vitest, no DB where possible; DB-touching tests use the same local Postgres as e2e).
- Every provider has a contract test that runs against both fake and (when keys exist) real; real runs are skipped by default.
- Security tests are first-class: approval invariants, suppression, prompt-injection fixtures, SSRF, token encryption, RLS shape.

## 7. Risks
| Risk | Mitigation |
|---|---|
| Google restricted-scope verification + annual CASA assessment takes weeks | Start the submission checklist in Phase 4; ship with test-user mode for the pilot; README checklist |
| Local Postgres unavailable → e2e blocked | Q1; I will not run migrations against a remote database without your OK |
| Contact coverage in India is weak | Verification hit-rate stored per country (insights/admin); marketing copy flagged in DECISIONS |
| Teal `#0E8A7D` with white text ≈ 4.4:1 (< AA 4.5 for small text) | Q6 — propose `#0B7A6E`; flagged, not silently changed |
| Dark input fields on a light page (from the supplied design JSON) | Implemented as specified; contrast checked; flagged in D-12 |
| Complaint signals are limited on Gmail (no feedback loop) | Complaints = abuse-phrase replies + admin-entered; thresholds on bounces are the primary guard (D-10) |
| Retaining `AuditEvent` after deletion vs DPDP/GDPR | Opaque ids only, PII scrubbed; counsel review item (D-09) |

## 8. Open questions (answers needed before / during Phase 1)
Defaults I will use if you don't object are in DECISIONS.

- **Q1** Which database do migrations and e2e run against? `.env.local` has a `DATABASE_URL` but nothing is listening on `localhost:5432`. Do you want me to use a local Postgres (install/start via Docker or Postgres 18), or a throw-away Supabase project? I will not migrate your live Supabase database without explicit approval.
- **Q2** Payments: the spec lists no payment processor. Phase 7 ships the credit ledger, trial credits, admin grants and a fake gateway. Which processor for real purchases (Razorpay for India? Stripe?) — can be deferred past this build.
- **Q3** Postal address for CAN-SPAM: require every candidate to enter one (home, PO box or mail-forwarding address), or send with Pilanilabs' address as "sent via"? Default: candidate-entered address required.
- **Q4** Confirm the private-job-row approach (D-05, `Job.ownerUserId`) vs making `TailoredResume.jobId` nullable.
- **Q5** Region default: exclude EU27 + EEA + UK + Switzerland unless `contactCountry` is known to be elsewhere; unknown country requires an explicit decision. OK?
- **Q6** Button teal `#0E8A7D` fails AA for small white text (≈4.4:1). Keep as specified, or use `#0B7A6E`?
- **Q7** Hosting region: add `"regions": ["bom1"]` (Mumbai) in `vercel.json` for the India-hosted-data option? Supabase project region would need to match.
- **Q8** "From scratch" in your prompt conflicts with "extend, do not rebuild". I am extending the existing repo at `D:\Pilanilabs-Job hunting tool` (the session opened in an empty folder).
