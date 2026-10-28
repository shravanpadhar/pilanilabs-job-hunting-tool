import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scrubDetail } from "@/lib/audit";
import { hashDomain, hashEmail, isPlausibleEmail, normalizeEmail } from "@/lib/compliance/suppression";
import { redact } from "@/lib/logger";
import { EVENT_SCHEMAS, parseEvent } from "@/lib/providers/queue/events";
import { InlineQueue } from "@/lib/providers/queue/inline";
import { buildInngestFunctions } from "@/lib/providers/queue/inngest";
import type { QueueFunction } from "@/lib/providers/queue/types";

describe("suppression hashing", () => {
  it("normalises case and whitespace but does not canonicalise plus-tags or dots", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(hashEmail("Ada@Example.com", "k".repeat(32))).toBe(hashEmail(" ada@example.com", "k".repeat(32)));
    expect(hashEmail("ada+x@example.com", "k".repeat(32))).not.toBe(hashEmail("ada@example.com", "k".repeat(32)));
    expect(hashEmail("a.da@example.com", "k".repeat(32))).not.toBe(hashEmail("ada@example.com", "k".repeat(32)));
  });

  it("is keyed: a different key gives a different hash and the address is not recoverable from it", () => {
    const a = hashEmail("ada@example.com", "a".repeat(32));
    const b = hashEmail("ada@example.com", "b".repeat(32));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("ada");
  });

  it("domain entries are distinct from address entries", () => {
    expect(hashDomain("example.com", "k".repeat(32))).toBe(hashDomain("@Example.com", "k".repeat(32)));
    expect(hashDomain("example.com", "k".repeat(32))).not.toBe(hashEmail("example.com", "k".repeat(32)));
  });

  it("validates plausible addresses", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
    expect(isPlausibleEmail("not an email")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
  });
});

describe("audit detail scrubbing", () => {
  it("removes plaintext email addresses at any depth and truncates long text", () => {
    const out = scrubDetail({ to: "Ada@Example.com", nested: { list: ["x@y.io", "ok"], note: "mail bob@corp.in please" }, big: "z".repeat(1000), n: 3, d: new Date(0) }) as Record<string, unknown>;
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/@(example|y|corp)\./i);
    expect(json).toContain("[email]");
    expect((out.big as string).length).toBe(200);
    expect(out.n).toBe(3);
    expect(out.d).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("log redaction", () => {
  it("masks secret-named fields and credential-looking values, including inside error strings", () => {
    const out = JSON.stringify(
      redact({
        event: "x",
        apiKey: "abc",
        nested: { refreshToken: "1//abc", Authorization: "Bearer abc.def" },
        message: "failed with Bearer abcdef123456 and key sk-ant-1234567890abcdefghij",
        encrypted: "v1.abcdef.ghijklmnop.qrstuvwxyz.0123456789.abcdefghijklmnopqrstuvwxyz",
        keep: "visible",
      }),
    );
    expect(out).not.toMatch(/abcdef123456|sk-ant|1\/\/abc|ghijklmnop/);
    expect(out).toContain("visible");
    expect(out).toContain("[redacted]");
  });
});

describe("queue", () => {
  const make = (handler: QueueFunction["handler"], retries = 2): QueueFunction => ({ id: "t", trigger: { event: "system/ping" }, retries, handler });

  it("delivers a validated event to its function", async () => {
    const seen: unknown[] = [];
    const q = new InlineQueue([make((async (d: unknown) => void seen.push(d)) as QueueFunction["handler"])]);
    await q.send("system/ping", { note: "hi" });
    expect(seen).toEqual([{ note: "hi" }]);
    expect(q.delivered).toMatchObject([{ functionId: "t", attempts: 1, ok: true }]);
  });

  it("rejects invalid payloads before anything runs", async () => {
    let ran = false;
    const q = new InlineQueue([make((async () => void (ran = true)) as QueueFunction["handler"])]);
    await expect(q.send("outreach/send.requested", {} as never)).rejects.toThrow();
    expect(ran).toBe(false);
  });

  it("retries a failing function and gives up after the configured attempts", async () => {
    let calls = 0;
    const q = new InlineQueue([make((async () => {
      calls++;
      if (calls < 3) throw new Error("boom");
    }) as QueueFunction["handler"])]);
    await q.send("system/ping", {});
    expect(calls).toBe(3);
    expect(q.delivered.at(-1)).toMatchObject({ attempts: 3, ok: true });

    calls = 0;
    const always = new InlineQueue([make((async () => {
      calls++;
      throw new Error("down");
    }) as QueueFunction["handler"], 1)]);
    await always.send("system/ping", {});
    expect(calls).toBe(2);
    expect(always.delivered.at(-1)).toMatchObject({ ok: false });
  });

  it("de-duplicates events that share an id", async () => {
    let calls = 0;
    const q = new InlineQueue([make((async () => void calls++) as QueueFunction["handler"])]);
    await q.send("system/ping", {}, { id: "same" });
    await q.send("system/ping", {}, { id: "same" });
    await q.send("system/ping", {}, { id: "other" });
    expect(calls).toBe(2);
  });

  it("runs cron functions on demand", async () => {
    let ran = 0;
    const q = new InlineQueue([{ id: "tick", trigger: { cron: "*/5 * * * *" }, handler: async () => void ran++ }]);
    await q.runCron("tick");
    expect(ran).toBe(1);
    await expect(q.runCron("missing")).rejects.toThrow();
  });

  it("event schemas carry ids only and the registry builds Inngest functions offline", () => {
    expect(Object.keys(EVENT_SCHEMAS).length).toBeGreaterThan(0);
    expect(parseEvent("outreach/send.requested", { messageId: "m1" })).toEqual({ messageId: "m1" });
    expect(() => parseEvent("outreach/send.requested", { messageId: "" })).toThrow();
    expect(buildInngestFunctions().length).toBeGreaterThan(0); // no network, no keys needed
  });
});

describe("client bundle hygiene", () => {
  // Only NEXT_PUBLIC_ variables may reach the browser, so "use client" files must not import server-only modules.
  const FORBIDDEN = ["@/lib/env", "@/lib/db", "@/lib/crypto", "@/lib/providers", "@/lib/compliance", "@/lib/audit", "@/lib/outreach", "@/lib/billing", "@/lib/admin", "@/lib/supabase/admin"];

  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("no client component imports server-only modules or reads non-public env vars", async () => {
    const root = process.cwd();
    const files = [...(await walk(path.join(root, "components"))), ...(await walk(path.join(root, "app")))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      if (!/^\s*["']use client["']/m.test(src.slice(0, 200))) continue;
      for (const bad of FORBIDDEN) if (new RegExp(`from\\s+["']${bad.replace(/[/@]/g, "\\$&")}(["'/])`).test(src)) offenders.push(`${path.relative(root, f)} imports ${bad}`);
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!m[1].startsWith("NEXT_PUBLIC_") && m[1] !== "NODE_ENV") offenders.push(`${path.relative(root, f)} reads ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the public env example never contains a real-looking secret", async () => {
    const example = await fs.readFile(path.join(process.cwd(), ".env.example"), "utf8");
    for (const line of example.split(/\r?\n/)) {
      if (line.trim().startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      const value = rest.join("=").trim().replace(/^"|"$/g, "");
      if (/KEY|SECRET|TOKEN|SID/.test(key) && !key.startsWith("NEXT_PUBLIC_")) expect(value, `${key} must be a blank placeholder`).toBe("");
    }
  });
});

