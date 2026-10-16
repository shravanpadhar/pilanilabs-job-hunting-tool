import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_TIMEOUT_MS, modelFor, type AiFeature } from "@/config/ai";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { openrouterChat, type ChatMessage, type ChatResult } from "@/lib/ai/openrouter";

let cached: Anthropic | null = null;

/** Server-side only. The API key never reaches the browser. */
export function anthropic(): Anthropic {
  if (!env.anthropicKey) {
    throw new AppError("AI features aren't configured yet. Add ANTHROPIC_API_KEY (or set AI_PROVIDER=openrouter and OPENROUTER_API_KEY).", 503, "ai_unavailable");
  }
  cached ??= new Anthropic({ apiKey: env.anthropicKey, timeout: AI_TIMEOUT_MS, maxRetries: 2 });
  return cached;
}

/** Pull a JSON value out of a model reply (handles ```json fences and stray prose). */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/[{[]/);
  if (start > 0) t = t.slice(start);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (end >= 0) t = t.slice(0, end + 1);
  return JSON.parse(t);
}

/** Compact JSON Schema for a Zod schema, embedded in prompts so the model knows the exact shape. */
export function schemaPrompt(schema: z.ZodType): string {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return JSON.stringify(js);
}

async function logUsage(userId: string | null | undefined, feature: AiFeature, model: string, r: ChatResult) {
  try {
    await db.aiUsage.create({
      data: { userId: userId ?? null, feature, model: model.split(",")[0], inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens },
    });
  } catch (err) {
    log.warn("ai_usage_log_failed", { feature, message: (err as Error).message });
  }
  log.info("ai_call", { feature, model: model.split(",")[0], provider: env.aiProvider, in: r.inputTokens, out: r.outputTokens, userId: userId ?? null });
}

export interface JsonCallOptions<S extends z.ZodType> {
  feature: AiFeature;
  userId?: string | null;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  /** Override the feature's default model from config/ai.ts. */
  model?: string;
}

function friendlyApiError(err: unknown): AppError {
  if (err instanceof Anthropic.RateLimitError) return new AppError("The AI service is busy right now. Please try again in a minute.", 503, "ai_busy");
  if (err instanceof Anthropic.AuthenticationError) return new AppError("AI service credentials are invalid. Please contact support.", 503, "ai_auth");
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AppError("The AI took too long to respond. Please try again.", 504, "ai_timeout");
  return new AppError("The AI service had a problem. Please try again.", 502, "ai_error");
}

/** One model call through the configured provider, normalised to a common result. */
async function chat(opts: { model: string; system: string; messages: ChatMessage[]; maxTokens: number; effort: "low" | "medium" | "high"; feature: AiFeature }): Promise<ChatResult> {
  if (env.aiProvider === "openrouter") return openrouterChat(opts);

  let response: Anthropic.Message;
  try {
    response = await anthropic().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      output_config: { effort: opts.effort },
    });
  } catch (err) {
    log.error("ai_request_failed", err, { feature: opts.feature, model: opts.model });
    throw friendlyApiError(err);
  }
  return {
    text: response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n"),
    stop: response.stop_reason === "refusal" ? "refusal" : response.stop_reason === "max_tokens" ? "truncated" : "end",
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * Call the configured model (Claude by default, or OpenRouter) and return Zod-validated JSON.
 * Retries once, feeding the validation error back to the model, then fails with a friendly error.
 * Token usage is logged to AiUsage.
 */
export async function callJson<S extends z.ZodType>(opts: JsonCallOptions<S>): Promise<z.output<S>> {
  const model = opts.model ?? modelFor(opts.feature, env.aiProvider);
  const system = `${opts.system}\n\nRespond with a single JSON object only — no markdown fences, no commentary. It must validate against this JSON Schema:\n${schemaPrompt(opts.schema)}`;
  const messages: ChatMessage[] = [{ role: "user", content: opts.user }];

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chat({ model, system, messages, maxTokens: opts.maxTokens ?? 8000, effort: opts.effort ?? "low", feature: opts.feature });
    await logUsage(opts.userId, opts.feature, model, result);

    if (result.stop === "refusal") {
      throw new AppError("The AI couldn't process this request. Please check the content and try again.", 422, "ai_refusal");
    }
    try {
      if (result.stop === "truncated") throw new Error("The reply was cut off before the JSON was complete.");
      const parsed = opts.schema.safeParse(extractJson(result.text));
      if (parsed.success) return parsed.data;
      lastProblem = z.prettifyError(parsed.error).slice(0, 1500);
    } catch (err) {
      lastProblem = `Invalid JSON: ${(err as Error).message}`;
    }
    log.warn("ai_invalid_output", { feature: opts.feature, attempt, problem: lastProblem.slice(0, 300) });
    messages.push(
      { role: "assistant", content: result.text || "(empty)" },
      { role: "user", content: `Your reply was not valid. Problem:\n${lastProblem}\n\nReturn the corrected JSON object only.` },
    );
  }
  throw new AppError("The AI returned an unexpected format. Please try again.", 502, "ai_invalid_output");
}
