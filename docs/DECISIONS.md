# Decisions and assumptions

Everything here is a choice I made (or an ambiguity I resolved with the safest reasonable option) so work could continue. **Items marked ⚠ need your confirmation.** Newest phase appends at the bottom of each section.

## Fixed by you (not up for change)
- F-1 LinkedIn = assisted mode only. F-2 Email = candidate's own Gmail via OAuth behind `MailboxProvider`. F-3 Contacts = licensed providers behind `ContactDataProvider` / `EmailVerifier`, fakes + marked stub. F-4 Durable managed queue (Inngest) behind an interface. F-5 EU/UK excluded by default.

## Phase 0

| # | Decision | Why | Confirm |
|---|---|---|---|
| D-01 | Spec stays at `docs/Pilanilabs-Career-Platform-Product-Spec.pdf`; the prompt's `docs/SPEC.pdf` is the same document. Not renamed/copied. | One source file, no drift | — |
| D-02 | Working repo is `D:\Pilanilabs-Job hunting tool` (git, branch `main`, 3 commits). The session started in an empty `D:\Pilani_labs_job hunting_agent`; I moved the session to the real repo. | The prompt says extend the existing repo | ⚠ Q8 |
| D-03 | Prompt says "from scratch" and also "extend; do not rebuild". I follow **extend**. | Explicit rule + spec §11 "build on the existing codebase" | ⚠ |
| D-04 | Work happens on branch `feat/career-platform`; `main` is untouched. | Reviewable, reversible | — |
| D-05 | Pasted/external jobs are stored as **private `Job` rows** (`Job.ownerUserId` set; `null` = shared). Feed, matching, hidden-jobs and company queries filter `ownerUserId IS NULL`; RLS lets the owner read their own. | `TailoredResume`, `Application` and the tailor flow all require a `Job` FK; putting strangers' pasted jobs into the shared feed would leak data and pollute matching | ⚠ Q4 |
| D-06 | Queue = **Inngest**; DB (`scheduledAt`) is the schedule source of truth; a 5-minute cron tick fans out per-message send events. Spec's `QUEUE_URL`/`QUEUE_TOKEN` map to `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` + `QUEUE_PROVIDER=inngest\|inline`. | Works on serverless, avoids Vercel Hobby cron limits and long sleeps, swappable | ⚠ (needs an Inngest account later) |
| D-07 | Added `SENDING` to `MessageState` and `sendKey`/`claimedAt`/`attempts`/`lastError`/`templateKey`/`attachmentSha256` to `OutreachMessage`. | Atomic claim + crash recovery for "never send twice"; the spec's six states can't express an in-flight send | — |
| D-08 | Added `OutreachProfile` (sender name, postal address, time zone, notification prefs, pause state) and `AppSetting` tables; added `TRIAL_GRANT` and `ADJUSTMENT` to `CreditReason`; `Reply.providerMessageId` unique; `ConnectedAccount.syncCursor`; `OutreachTarget.country/riskAcknowledgedAt/emailHash`; `OutreachCampaign.companyKey/companyType`; `AiUsage.costMicros`. | Needed for requirements the spec states but doesn't give a column for (sender identity, free trial, dedup of polled replies, cost control, insights by company type) | — |
| D-09 | Suppression hash = HMAC-SHA256 of the lowercased, trimmed address using `SUPPRESSION_HASH_KEY` (new env, required in production). No Gmail dot/plus canonicalisation. `AuditEvent` keeps only opaque user uuid + ids + hashes after account deletion; its `detail` never holds plaintext emails. | HMAC resists rainbow-table reversal of the list; over-canonicalising could suppress the wrong person. If the key is lost or rotated the list stops matching — back it up | ⚠ counsel to confirm retention of `AuditEvent` after deletion |
| D-10 | Gmail gives no spam-complaint feedback loop. "Complaint" = a reply matching abuse/report phrases, or an admin entry; **bounce rate is the primary automatic guard**. Thresholds (7-day window, min sample): bounce > 5 %, complaint > 0.3 % or ≥ 2 complaints → auto-pause. | Honest about what can be measured | ⚠ thresholds |
| D-11 | Suggested replies are **shown, never sent**. "Answer" = copy text or open the thread in Gmail. No send-from-our-UI reply path in this build. | Rule: AI never sends; avoids a second approval flow | — |
| D-12 | Design: the supplied design JSON replaces the existing gold/Playfair brand. Tokens remapped in `app/globals.css` (primary action `#0E8A7D`, brand blue `#89A9C3`, navy `#0B2236`, accent/link `#566574`, cream `#F6F5F1`), Fraunces headings, Inter body, 8 px radius, **dark navy inputs (`#102B43`, white text) even in light mode**, white secondary buttons with the specified shadow. The logo is the supplied PNG, saved as a static asset (not base64-inlined). White on `#0E8A7D` ≈ 4.4:1 (below AA for small text). | Implementing your spec as written; flagged rather than silently altered | ⚠ Q6 |
| D-13 | Region filter: EU27 + EEA (IS, LI, NO) + UK + Switzerland blocked. Unknown contact country → shown but needs an explicit decision (same flow as low confidence). Recipient time zone from contact country (else company HQ/job location) → `config/regions.ts`; US defaults to America/New_York unless a state is known. | Safest default pending lawful-basis review | ⚠ Q5 |
| D-14 | No open-tracking pixels or link tracking. Spec step 10 says "opened if tracked" — not tracked. | Deliverability, privacy, Google API policy | — |
| D-15 | Gmail `gmail.send` + `gmail.readonly`, requested incrementally. Reply bodies are not stored — only a ≤ 300-char snippet and message ids. | Minimal scopes; restricted-scope policy | — |
| D-16 | Opt-out: link in every email → confirmation page with one-click POST (not GET), plus `List-Unsubscribe` and `List-Unsubscribe-Post`. Replying "unsubscribe" also opts out by rule. | Mail scanners prefetch GET links and would unsubscribe people by accident | — |
| D-17 | Follow-ups stay in the same Gmail thread with the same subject (no fake "Re:"). | Truthful threading, CAN-SPAM no-deception | — |
| D-18 | LinkedIn lane: the system never marks `ACCEPTED` (it can't observe it). At day 14 it prompts the user to withdraw and not message; if the user does nothing for 3 more days the system records `WITHDRAWN` (`markedBy=SYSTEM`) and stops prompting. A reply/bounce/opt-out on the email lane freezes the LinkedIn lane too (spec step 9: "pauses all further steps to that person"). | Matches spec step 8–9 | ⚠ |
| D-19 | Billing in this build = ledger, trial credits, admin grants, fake payment gateway. No real payment processor. Trial size and prices are config (`AppSetting` over `config/pricing.ts`), not hard-coded. | Spec lists no processor | ⚠ Q2 |
| D-20 | Admin access by `ADMIN_EMAILS` allow-list (new env); every admin read/write is audit-logged. | Spec: "admin access is logged" | — |
| D-21 | Postal address: candidate-entered address required before any send (PO box/forwarding address allowed). | CAN-SPAM requires a physical address | ⚠ Q3 |
| D-22 | New env vars beyond spec §12: `QUEUE_PROVIDER`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `MAILBOX_PROVIDER`, `CONTACT_DATA_PROVIDER`, `EMAIL_VERIFY_PROVIDER`, `SUPPRESSION_HASH_KEY`, `OPT_OUT_SIGNING_KEY`, `ADMIN_EMAILS`, `OUTREACH_SENDING_ENABLED` (kill switch, default off in production), `EXTERNAL_FAKES` (non-production only). | Needed to make fakes/real selectable and to protect sending | — |
| D-23 | `README`/`ARCHITECTURE` say 69 unit tests; the repo has 79 (matches the spec). Docs will be corrected. Also README says the refresh cron is 6-hourly but `vercel.json` is daily. | Accuracy | — |

## Later phases
_Appended as each phase lands._
