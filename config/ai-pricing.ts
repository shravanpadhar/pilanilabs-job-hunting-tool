/**
 * Estimated model prices in US dollars per MILLION tokens ([input, output]). These are planning estimates used for
 * the per-candidate cost ceiling and margin tracking, not billing records: check your provider's price list and
 * edit here. Because $1 per million tokens is exactly 1 micro-dollar per token, the numbers below double as
 * "micro-dollars per token". Unknown models count as the quality-model price (safe side).
 */
const QUALITY: [number, number] = [3, 15];
const FAST: [number, number] = [1, 5];

export function modelPriceMicrosPerToken(model: string): [number, number] {
  const m = model.toLowerCase();
  if (m.startsWith("fake") || m.includes(":free")) return [0, 0];
  if (m.includes("haiku") || m.includes("flash") || m.includes("mini")) return FAST;
  return QUALITY;
}

export function estimateAiCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const [pi, po] = modelPriceMicrosPerToken(model);
  return Math.round(inputTokens * pi + outputTokens * po);
}
