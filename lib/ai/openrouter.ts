import { AI_TIMEOUT_MS } from "@/config/ai";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { sleep } from "@/lib/utils";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  stop: "end" | "truncated" | "refusal";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

interface OpenRouterResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string; code?: number | string };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

function mapError(status: number, message: string): AppError {
  if (status === 401 || status === 403) return new AppError("The AI service rejected the API key. Check OPENROUTER_API_KEY.", 503, "ai_auth");
  if (status === 402) return new AppError("Your OpenRouter account is out of credits (or the model needs credits).", 503, "ai_credits");
  if (status === 404 || /no endpoints found|model .* not (found|available)/i.test(message)) {
    return new AppError("The configured AI model isn't available on OpenRouter right now. Pick another in OPENROUTER_MODEL_QUALITY / OPENROUTER_MODEL_FAST.", 503, "ai_model_unavailable");
  }
  if (status === 429) return new AppError("The free AI model is rate-limited right now. Please try again in a minute.", 503, "ai_busy");
  if (status === 408 || status === 504) return new AppError("The AI took too long to respond. Please try again.", 504, "ai_timeout");
  return new AppError("The AI service had a problem. Please try again.", 502, "ai_error");
}

/**
 * One chat completion through OpenRouter (OpenAI-compatible API: https://openrouter.ai/docs/api-reference).
 * Retries rate limits / transient errors, and falls back to a plain request if the model rejects JSON mode.
 */
export async function openrouterChat(opts: {
  /** One model id, or a comma-separated fallback chain (tried in order). */
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
}): Promise<ChatResult> {
  if (!env.openrouterKey) throw new AppError("AI features aren't configured yet. Add OPENROUTER_API_KEY to enable them.", 503, "ai_unavailable");

  const models = opts.model.split(",").map((m) => m.trim()).filter(Boolean);
  let jsonMode = true;
  const baseDelay = Number(process.env.AI_RETRY_DELAY_MS ?? 2000);

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${env.openrouterBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.appUrl,
          "X-Title": "Pilanilabs Job Hunting Tool",
        },
        body: JSON.stringify({
          model: models[0],
          // OpenRouter's native fallback: if the first model is rate-limited / down it tries the next.
          ...(models.length > 1 ? { models } : {}),
          // Reasoning models spend part of max_tokens thinking; leave headroom, keep the thinking short and hidden.
          max_tokens: opts.maxTokens + 4000,
          reasoning: { effort: opts.effort ?? "low", exclude: true },
          temperature: 0.2,
          messages: [{ role: "system", content: opts.system }, ...opts.messages],
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(baseDelay * (attempt + 1));
        continue;
      }
      log.error("openrouter_network_error", err, { model: models[0] });
      throw (err as Error).name === "TimeoutError" ? mapError(504, "") : mapError(502, "");
    }

    const data = (await res.json().catch(() => ({}))) as OpenRouterResponse;
    // OpenRouter can also report upstream provider failures inside a 200 response.
    const status = res.ok && data.error ? Number(data.error.code) || 502 : res.status;
    const message = data.error?.message ?? "";

    if (status >= 400) {
      if (status === 400 && jsonMode && /response_format|json/i.test(message)) {
        jsonMode = false; // this model doesn't support JSON mode — the prompt + validator still enforce JSON
        continue;
      }
      if (RETRYABLE.has(status) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after")) * 1000;
        await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : baseDelay * (attempt + 1), 15_000));
        continue;
      }
      log.warn("openrouter_error", { status, model: models[0], message: message.slice(0, 200) });
      throw mapError(status, message);
    }

    const choice = data.choices?.[0];
    if (data.model) log.info("openrouter_model_used", { requested: models[0], used: data.model });
    const finish = choice?.finish_reason ?? "stop";
    return {
      text: choice?.message?.content ?? "",
      stop: finish === "length" ? "truncated" : finish === "content_filter" ? "refusal" : "end",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
  }
}
