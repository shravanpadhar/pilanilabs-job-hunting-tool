/** Matching-engine constants. */
export const matching = {
  /** Only consider jobs posted within this window when matching. */
  windowDays: 14,
  /** Stage 1 (no AI) keeps this many candidates per user as Match rows. */
  stage1Keep: 200,
  /** Stage 2 (Claude Haiku) re-scores the best N stage-1 candidates. */
  stage2Top: 50,
  /** Jobs per Claude request in stage 2. */
  stage2BatchSize: 10,
  /** Stage-1 candidates below this score are dropped. */
  minStage1Score: 15,
} as const;
