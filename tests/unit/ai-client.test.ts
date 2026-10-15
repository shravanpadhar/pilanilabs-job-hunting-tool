import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { sampleResume, sampleResumeText } from "./fixtures";

/**
 * Exercises lib/ai/client.ts through the REAL Anthropic SDK against a local fake Messages API
 * (ANTHROPIC_BASE_URL), so request shape, retry-on-invalid-JSON, refusals, error mapping and
 * usage logging are all covered without a real key or network.
 */
const usageRows: unknown[] = [];
vi.mock("@/lib/db", () => ({ db: { aiUsage: { create: vi.fn(async ({ data }: { data: unknown }) => usageRows.push(data)) } } }));

let server: Server;
let replies: Array<{ status?: number; text?: string; stop_reason?: string; body?: unknown }> = [];
const requests: Array<Record<string, unknown>> = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    requests.push(JSON.parse(await readBody(req)));
    const r = replies.shift() ?? { text: "{}" };
    res.setHeader("content-type", "application/json");
    res.setHeader("retry-after-ms", "1"); // keep the SDK's built-in 429 retries fast
    res.statusCode = r.status ?? 200;
    res.end(
      JSON.stringify(
        r.body ?? {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: r.text ?? "{}" }],
          stop_reason: r.stop_reason ?? "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 120, output_tokens: 45 },
        },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  replies = [];
  requests.length = 0;
  usageRows.length = 0;
});

const schema = z.object({ answer: z.string(), n: z.number() });

describe("callJson", () => {
  it("sends model, schema-in-system-prompt and effort; returns validated JSON; logs usage", async () => {
    const { callJson } = await import("@/lib/ai/client");
    replies = [{ text: '```json\n{"answer":"hi","n":3}\n```' }];
    const out = await callJson({ feature: "referral", userId: "u1", system: "Be brief.", user: "Say hi", schema, effort: "low" });
    expect(out).toEqual({ answer: "hi", n: 3 });

    const req = requests[0] as { model: string; system: string; output_config: { effort: string }; messages: Array<{ role: string }>; max_tokens: number };
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.system).toContain("JSON Schema");
    expect(req.system).toContain('"answer"');
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.max_tokens).toBeGreaterThan(1000);
    expect(usageRows).toEqual([expect.objectContaining({ userId: "u1", feature: "referral", inputTokens: 120, outputTokens: 45 })]);
  });

  it("uses the fast model for bulk scoring (from config/ai.ts)", async () => {
    const { callJson } = await import("@/lib/ai/client");
    replies = [{ text: '{"answer":"x","n":1}' }];
    await callJson({ feature: "score_matches", system: "s", user: "u", schema });
    expect((requests[0] as { model: string }).model).toBe("claude-haiku-5-5");
  });

  it("retries once with the validation error when the first reply is invalid", async () => {
    const { callJson } = await import("@/lib/ai/client");
    replies = [{ text: '{"answer": 5}' }, { text: '{"answer":"fixed","n":2}' }];
    const out = await callJson({ feature: "referral", system: "s", user: "u", schema });
    expect(out.answer).toBe("fixed");
    expect(requests).toHaveLength(2);
    const second = (requests[1] as { messages: Array<{ role: string; content: string }> }).messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[2].content).toMatch(/not valid/i);
    expect(usageRows).toHaveLength(2);
  });

  it("gives up with a friendly error after two invalid replies", async () => {
    const { callJson } = await import("@/lib/ai/client");
    replies = [{ text: "not json" }, { text: "still not json" }];
    await expect(callJson({ feature: "referral", system: "s", user: "u", schema })).rejects.toMatchObject({ code: "ai_invalid_output", status: 502 });
  });

  it("treats a truncated reply (max_tokens) as invalid", async () => {
    const { callJson } = await import("@/lib/ai/client");
    replies = [{ text: '{"answer":"x"', stop_reason: "max_tokens" }, { text: '{"answer":"ok","n":1}' }];
    expect((await callJson({ feature: "referral", system: "s", user: "u", schema })).answer).toBe("ok");
  });

  it("surfaces refusals as a friendly 422", async () => {
    const { callJson } = await import("@/lib/ai/client");
    replies = [{ text: "", stop_reason: "refusal" }];
    await expect(callJson({ feature: "referral", system: "s", user: "u", schema })).rejects.toMatchObject({ code: "ai_refusal", status: 422 });
  });

  it("maps API errors to friendly messages", async () => {
    const { callJson } = await import("@/lib/ai/client");
    const rateLimited = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } };
    replies = [rateLimited, rateLimited, rateLimited]; // the SDK itself retries 429s up to twice
    await expect(callJson({ feature: "referral", system: "s", user: "u", schema })).rejects.toMatchObject({ code: "ai_busy" });
    replies = [{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "bad key" } } }];
    await expect(callJson({ feature: "referral", system: "s", user: "u", schema })).rejects.toMatchObject({ code: "ai_auth" });
  });
});

describe("resume parsing with Claude", () => {
  it("drops contact details the model hallucinated and recomputes experience", async () => {
    vi.resetModules();
    const { parseResumeText } = await import("@/lib/ai/parse-resume");
    const hallucinated = structuredClone(sampleResume);
    hallucinated.contact.email = "made.up@nowhere.com"; // not in the resume text
    hallucinated.contact.phone = "+1 555 000 0000"; // not in the resume text
    hallucinated.totalYearsExperience = 20; // wildly off vs. dates
    replies = [{ text: JSON.stringify(hallucinated) }];
    const { data, usedAi } = await parseResumeText(sampleResumeText, "u1");
    expect(usedAi).toBe(true);
    expect(data.contact.email).toBeNull();
    expect(data.contact.phone).toBeNull();
    expect(data.contact.name).toBe("Asha Verma");
    expect(data.totalYearsExperience).toBeLessThan(10);
  });
});
