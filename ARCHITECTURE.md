# Architecture

## Folder map

```
app/            Next.js routes (pages + /api route handlers), proxy.ts guards sessions
components/     UI (ui/ = shadcn-style primitives), feature components
config/         Models, matching knobs, ATS company boards, company profiles, skill vocabulary
lib/
  sources/      One connector per job source + normalise + dedupe + board URL parsing
  jobs/         Ingest (upsert), refresh orchestration, feed queries, filters
  matching/     Skill/text utilities, stage-1 scoring, profile builder, per-user match run
  ai/           Claude client (Zod-validated JSON), parse / score / tailor / cover letter / referral
  resume/       Schema, text extraction (magic bytes), heuristic parser, ATS checker, anti-fabrication, PDF/DOCX
  alerts/       Digest rendering, Resend + Twilio channels, scheduling
prisma/         schema, migrations (0001 init, 0002 RLS), seed
scripts/        fetch-jobs, send-alerts
tests/          unit/ (Vitest), e2e/ (Playwright)
```

## Data flow

```
 cron (6h) ─► refreshJobs ─► connectors (parallel, failures isolated) ─► normalise ─► mergeDuplicates
                                                                              │
                                                  upsert Job (dedupeHash, sourcesSeen[], skills[])
                                                                              │
 user uploads resume ─► magic-byte check ─► text extraction ─► Claude parse (Zod) ─► Resume.parsedJson
                                                                              │
 user reviews/edits profile + preferences ──────────────────────────────────►│
                                                                              ▼
                              computeMatchesForUser:  stage 1 (no AI, all recent jobs, hard filters + score)
                                                     keep top 200 ─► Match rows
                                                     stage 2 (Haiku, batches of 10) re-scores top 50, cached by profileHash
                                                                              │
                         /jobs feed ◄─ Match ⨝ Job (filters, sort, infinite scroll) ─► /jobs/[id]
                                                                              │
              Tailor (Sonnet) ─► verify vs original ─► repair ─► TailoredResume ─► PDF / DOCX export
              Apply ─► original site (new tab) ─► confirm ─► Application (Kanban)
 cron (daily) ─► runAlerts ─► top new matches / saved searches ─► Resend email, Twilio WhatsApp
```

## Key mechanisms

**Dedupe.** `dedupeHash = sha256(normalizedTitle | normalizedCompany | normalizedCity)`. Normalisation lowercases, strips punctuation, "(Remote)" noise, corporate suffixes (Pvt/Ltd/Inc…) and maps city aliases (Bangalore→Bengaluru, Gurgaon→Gurugram). On collision the most complete record wins (description length, salary, logo, company-hosted), gaps are filled from the loser, and every source seen is kept in `sourcesSeen`.

**Hidden jobs.** A job is "hidden" when `isDirect` and none of `sourcesSeen` is an aggregator — i.e. it only exists on the company's own Greenhouse/Lever/Ashby board.

**Matching.** Stage 1 is deterministic: hard filters (location, remote-only, job type, minimum salary when stated, exclude keywords, large experience gap, country-restricted "remote") then `0.45·skills + 0.30·title (with role synonyms) + 0.10·experience + 0.15·location (+ keyword bonus)`. Job skills are extracted once at ingest. Stage 2 asks Claude Haiku for a 0–100 score, one-line reason, matching/missing skills and `under/fit/over` for the top 50 and stores them; the final score blends 80% AI / 20% stage 1. AI results are reused until the resume or preferences change (`Match.profileHash`).

**No-fabrication guard.** The tailoring system prompt forbids invented facts, and the output is then verified in code (`lib/resume/verify.ts`): companies, titles, dates, institutions, degrees, certifications, skills and every number must exist in the original. Violations trigger one corrective Claude call; whatever remains is removed programmatically (`repairFabrications`), employers are restored if dropped, and contact details are always copied from the original. `tests/unit/fabrication.test.ts` checks the subset property, including against a deliberately misbehaving model.

**AI calls** all go through `lib/ai/client.ts`: server-side only, Zod-validated JSON, one retry that feeds the validation error back, SDK timeouts/retries, friendly error mapping, and a row per call in `AiUsage` (also the source of the per-user daily limits in `config/ai.ts`). Models live in `config/ai.ts` (override with `ANTHROPIC_MODEL_QUALITY` / `ANTHROPIC_MODEL_FAST`).

**Auth & security.** Supabase Auth (magic link, Google); `proxy.ts` refreshes the session and redirects signed-out visitors. API routes call `requireUserApi()` and scope every query by user id. Uploads are validated by magic bytes and size; files live in a private bucket behind signed URLs; job HTML is sanitised at ingest and again at render; redirects are same-site only; cron routes require the bearer secret (timing-safe compare); only three fixed hosts are ever fetched for user-added career pages and the slug is regex-validated.

## Adding a new job source

1. Create `lib/sources/<name>.ts` exporting a `JobSourceConnector`:

   ```ts
   export const acme: JobSourceConnector = {
     name: "acme",
     mode: "feed",                       // "search" = called once per query; "feed" = once per run
     isEnabled: () => Boolean(env.acmeKey),   // false → skipped silently
     async fetchJobs(query) { /* call the API, map every item to NormalizedJob */ },
   };
   ```
   Map into `NormalizedJob` (see `lib/sources/types.ts`): annual salaries, `postedAt` as a `Date`, an http(s) `applyUrl`, `attributionUrl` if the terms require a link back, `isDirect: true` only for a company's own ATS. Reuse helpers in `lib/sources/normalize.ts` (`cleanHtml`, `htmlToPlain`, `annualize`, `mapEmploymentType`, `safeUrl`…).
2. Register it in the `CONNECTORS` array in `lib/sources/index.ts`.
3. Add its label to `SOURCE_LABEL` in `lib/format.ts`, and to `AGGREGATOR_SOURCES` in `config/companies.ts` if it aggregates other portals (so it isn't treated as "hidden").
4. Add env vars to `.env.example` and the README table; add the footer attribution if its terms require one.
5. Test it with `npm run fetch-jobs -- --only=acme`. Failures are logged as `source_failed` and never affect other sources.

To track another company's ATS board, add it to `config/companies.ts` (or paste its career-page URL on the Hidden jobs page).
