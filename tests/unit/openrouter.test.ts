import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** The OpenRouter provider, exercised through callJson against a local fake chat-completions API. */
const usageRows: unknown[] = [];
vi.mock("@/lib/db", () => ({ db: { aiUsage: { create: vi.fn(async ({ data }: { data: unknown }) => usageRows.push(data)) } } }));

type Reply = { status?: number; content?: string | null; finish?: string; body?: unknown; headers?: Record<string, string> };
let server: Server;
let replies: Reply[] = [];
const requests: Array<Record<string, unknown>> = [];

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    requests.push({ ...JSON.parse(await readBody(req)), __auth: req.headers.authorization });
    const r = replies.shift() ?? { content: "{}" };
    res.setHeader("content-type", "application/json");
    for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
    res.statusCode = r.status ?? 200;
    res.end(
      JSON.stringify(
        r.body ?? {
          id: "gen-1",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          choices: [{ message: { role: "assistant", content: r.content ?? "{}" }, finish_reason: r.finish ?? "stop" }],
          usage: { prompt_tokens: 200, completion_tokens: 80 },
        },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "or-test-key";
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  process.env.AI_RETRY_DELAY_MS = "1";
});

afterAll(async () => {
  delete process.env.AI_PROVIDER;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_BASE_URL;
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  replies = [];
  requests.length = 0;
  usageRows.length = 0;
});

const schema = z.object({ answer: z.string() });
const call = async (over: Record<string, unknown> = {}) => {
  const { callJson } = await import("@/lib/ai/client");
  return callJson({ feature: "referral", userId: "u1", system: "s", user: "u", schema, ...over } as Parameters<typeof callJson<typeof schema>>[0]);
};

describe("OpenRouter provider", () => {
  it("sends the key, a free-model fallback chain, hidden low-effort reasoning and headroom for thinking tokens", async () => {
    replies = [{ content: '{"answer":"hi"}' }];
    expect((await call({ maxTokens: 1000 })).answer).toBe("hi");
    const req = requests[0] as { model: string; models: string[]; max_tokens: number; reasoning: unknown; response_format: unknown; messages: Array<{ role: string }>; __auth: string };
    expect(req.__auth).toBe("Bearer or-test-key");
    expect(req.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(req.models).toEqual(["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"]);
    expect(req.max_tokens).toBe(5000);
    expect(req.reasoning).toEqual({ effort: "low", exclude: true });
    expect(req.response_format).toEqual({ type: "json_object" });
    expect(req.messages[0].role).toBe("system");
    expect(usageRows).toEqual([expect.objectContaining({ userId: "u1", model: "nvidia/nemotron-3-ultra-550b-a55b:free", inputTokens: 200, outputTokens: 80 })]);
  });

  it("honours OPENROUTER_MODEL_* overrides", async () => {
    process.env.OPENROUTER_MODEL_QUALITY = "google/gemini-3.5-flash-lite";
    replies = [{ content: '{"answer":"x"}' }];
    await call();
    delete process.env.OPENROUTER_MODEL_QUALITY;
    const req = requests[0] as { model: string; models?: string[] };
    expect(req.model).toBe("google/gemini-3.5-flash-lite");
    expect(req.models).toBeUndefined();
  });

  it("retries rate limits, then succeeds", async () => {
    replies = [{ status: 429, body: { error: { message: "rate limited", code: 429 } } }, { content: '{"answer":"ok"}' }];
    expect((await call()).answer).toBe("ok");
    expect(requests).toHaveLength(2);
  });

  it("gives a friendly error when still rate-limited", async () => {
    const limited = { status: 429, body: { error: { message: "rate limited", code: 429 } } };
    replies = [limited, limited, limited];
    await expect(call()).rejects.toMatchObject({ code: "ai_busy", status: 503 });
  });

  it("retries without JSON mode if the model rejects response_format", async () => {
    replies = [{ status: 400, body: { error: { message: "response_format is not supported by this model", code: 400 } } }, { content: '{"answer":"plain"}' }];
    expect((await call()).answer).toBe("plain");
    expect((requests[1] as { response_format?: unknown }).response_format).toBeUndefined();
  });

  it("treats upstream errors inside a 200 response as errors", async () => {
    replies = [{ body: { error: { message: "Provider returned error", code: 502 } } }, { body: { error: { message: "Provider returned error", code: 502 } } }, { body: { error: { message: "Provider returned error", code: 502 } } }];
    await expect(call()).rejects.toMatchObject({ code: "ai_error" });
  });

  it("maps auth, credit and missing-model errors", async () => {
    replies = [{ status: 401, body: { error: { message: "No auth credentials found", code: 401 } } }];
    await expect(call()).rejects.toMatchObject({ code: "ai_auth" });
    replies = [{ status: 402, body: { error: { message: "Insufficient credits", code: 402 } } }];
    await expect(call()).rejects.toMatchObject({ code: "ai_credits" });
    replies = [{ status: 404, body: { error: { message: "No endpoints found for x", code: 404 } } }];
    await expect(call()).rejects.toMatchObject({ code: "ai_model_unavailable" });
  });

  it("recovers from invalid / truncated JSON via the validation retry", async () => {
    replies = [{ content: "Sure! here you go", finish: "stop" }, { content: '```json\n{"answer":"fixed"}\n```' }];
    expect((await call()).answer).toBe("fixed");
    replies = [{ content: '{"answer":"cut', finish: "length" }, { content: '{"answer":"whole"}' }];
    expect((await call()).answer).toBe("whole");
  });

  it("surfaces content-filter stops as a refusal", async () => {
    replies = [{ content: "", finish: "content_filter" }];
    await expect(call()).rejects.toMatchObject({ code: "ai_refusal" });
  });

  it("AI match scoring is on by default and can be switched off", async () => {
    const { env } = await import("@/lib/env");
    expect(env.aiMatchScoring).toBe(true);
    process.env.AI_MATCH_SCORING = "false";
    expect(env.aiMatchScoring).toBe(false);
    delete process.env.AI_MATCH_SCORING;
  });
});
