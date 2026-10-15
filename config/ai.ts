/**
 * Claude model names and AI limits. Change models here (or via env) — nothing else
 * in the codebase hard-codes a model id.
 */
export const AI_MODELS = {
  /** Resume parsing, tailoring, cover letters, referral drafts. */
  quality: process.env.ANTHROPIC_MODEL_QUALITY ?? "claude-sonnet-5-5",
  /** Bulk match scoring. */
  fast: process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-5-5",
} as const;

/**
 * OpenRouter models (https://openrouter.ai/models?max_price=0 lists the free ones). Defaults are Google's
 * free Gemma 4 models. Gemini itself is paid on OpenRouter — to use it, set e.g.
 * OPENROUTER_MODEL_QUALITY=google/gemini-3.5-flash-lite. Read lazily so env changes apply without a rebuild.
 */
export const OPENROUTER_DEFAULTS = { quality: "google/gemma-4-31b-it:free", fast: "google/gemma-4-26b-a4b-it:free" } as const;

export type AiFeature =
  | "parse_resume"
  | "score_matches"
  | "tailor_resume"
  | "cover_letter"
  | "referral";

export const AI_FEATURE_MODEL: Record<AiFeature, string> = {
  parse_resume: AI_MODELS.quality,
  score_matches: AI_MODELS.fast,
  tailor_resume: AI_MODELS.quality,
  cover_letter: AI_MODELS.quality,
  referral: AI_MODELS.quality,
};

const FAST_FEATURES: AiFeature[] = ["score_matches"];

/** Model id for a feature under the given provider. */
export function modelFor(feature: AiFeature, provider: "anthropic" | "openrouter"): string {
  if (provider === "openrouter") {
    return FAST_FEATURES.includes(feature)
      ? (process.env.OPENROUTER_MODEL_FAST?.trim() || OPENROUTER_DEFAULTS.fast)
      : (process.env.OPENROUTER_MODEL_QUALITY?.trim() || OPENROUTER_DEFAULTS.quality);
  }
  return AI_FEATURE_MODEL[feature];
}

/** Per-user rolling 24h request limits for AI endpoints. */
export const AI_DAILY_LIMITS: Record<AiFeature, number> = {
  parse_resume: 10,
  score_matches: 30,
  tailor_resume: 20,
  cover_letter: 20,
  referral: 30,
};

export const AI_TIMEOUT_MS = 120_000;
