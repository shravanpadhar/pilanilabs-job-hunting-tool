/**
 * Outreach tunables. Everything that is a "knob" lives here (or in AppSetting for admin-editable values),
 * never inline in feature code. See docs/PLAN.md section 3 for how each one is used.
 */
export const outreach = {
  /** Targets proposed per job (spec section 5, step 3). */
  targetsPerJob: 3,
  maxTargetsPerJob: 5,
  /** Contacts below this confidence are shown but cannot be sent without an explicit decision. */
  confidenceThreshold: 0.7,
  /** One touch per company per candidate within this window (spec section 5, step 2). */
  companyCooldownDays: 30,

  /** Email sequence: initial on day 0, follow-up on day 3, final note on day 7. */
  sequenceDays: [0, 3, 7] as const,
  /** Recipient local working hours (Monday-Friday). */
  workingHours: { startHour: 9, endHour: 17 },
  /** Minimum gap between two sends from the same mailbox, and the random jitter added on top. */
  minSpacingMinutes: 6,
  spacingJitterMinutes: 6,

  /** Draft limits (spec section 5 step 5, section 9). */
  email: { maxWords: 120, maxSubjectChars: 80 },
  linkedinNoteMaxChars: 300,

  /**
   * Warm-up ramp for a newly connected mailbox: [days since connected, max sends per day].
   * The mailbox cap the user chose is applied on top, and `hardMaxDailySends` is an absolute ceiling.
   */
  warmup: [
    { fromDay: 0, cap: 5 },
    { fromDay: 3, cap: 10 },
    { fromDay: 7, cap: 20 },
    { fromDay: 14, cap: 30 },
  ],
  defaultDailyCap: 20,
  hardMaxDailySends: 30,

  /** Per-recipient and per-company frequency limits. */
  minDaysBetweenStepsToSameRecipient: 2,
  maxTargetsPerCompanyPerCampaign: 3,

  /** Auto-pause thresholds, measured over a rolling window with a minimum sample (D-10). */
  health: {
    windowDays: 7,
    minSample: 20,
    maxBounceRate: 0.05,
    maxComplaintRate: 0.003,
    maxComplaints: 2,
  },

  /** A send claimed longer ago than this is considered orphaned and goes through recovery (D-07). */
  staleClaimMinutes: 10,

  linkedin: {
    /** Connection requests unanswered for this long are expired (spec section 5, step 8). */
    expiryDays: 14,
    reminderDay: 7,
    /** After expiry, if the user does nothing for this many days the system records WITHDRAWN (D-18). */
    autoWithdrawGraceDays: 3,
  },

  /** Rolling per-candidate cost ceiling over the last 30 days, in millionths of a US dollar. */
  costCeilingMicros: 5_000_000,
  costWindowDays: 30,
} as const;
