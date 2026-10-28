import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LinkedInState } from "@/generated/prisma/enums";
import { linkedinActions, nextLinkedInState, requestExpiry, waitStatus, type LinkedInEvent } from "@/lib/outreach/linkedin";

const STATES: LinkedInState[] = ["NOT_STARTED", "CONNECT_PENDING", "ACCEPTED", "MESSAGED", "WITHDRAWN"];
const EVENTS: LinkedInEvent[] = ["request_sent", "accepted", "message_sent", "withdraw"];

describe("LinkedIn state machine", () => {
  it("allows exactly the legal moves", () => {
    const legal: Array<[LinkedInState, LinkedInEvent, LinkedInState]> = [
      ["NOT_STARTED", "request_sent", "CONNECT_PENDING"], ["NOT_STARTED", "withdraw", "WITHDRAWN"],
      ["CONNECT_PENDING", "accepted", "ACCEPTED"], ["CONNECT_PENDING", "withdraw", "WITHDRAWN"],
      ["ACCEPTED", "message_sent", "MESSAGED"], ["ACCEPTED", "withdraw", "WITHDRAWN"],
    ];
    for (const [from, ev, to] of legal) expect(nextLinkedInState(from, ev)).toBe(to);
    for (const from of STATES) for (const ev of EVENTS) {
      if (legal.some(([f, e]) => f === from && e === ev)) continue;
      expect(() => nextLinkedInState(from, ev), `${from} + ${ev}`).toThrow();
    }
  });

  it("never allows a message before acceptance, and nothing after withdrawal or a message", () => {
    expect(() => nextLinkedInState("NOT_STARTED", "message_sent")).toThrow(/after they accept/);
    expect(() => nextLinkedInState("CONNECT_PENDING", "message_sent")).toThrow(/after they accept/);
    expect(() => nextLinkedInState("WITHDRAWN", "message_sent")).toThrow(/withdrawn/);
    expect(() => nextLinkedInState("WITHDRAWN", "request_sent")).toThrow();
    expect(() => nextLinkedInState("MESSAGED", "withdraw")).toThrow(/already messaged/);
  });
});

describe("the 14-day wait", () => {
  const sent = new Date("2026-11-01T10:00:00Z");
  const after = (days: number) => new Date(sent.getTime() + days * 86_400_000);
  it("expires 14 days after the request", () => expect(requestExpiry(sent).toISOString()).toBe("2026-11-15T10:00:00.000Z"));
  it("moves through waiting, reminder (day 7), expired (day 14) and auto-withdraw (day 17)", () => {
    expect(waitStatus(sent, after(0))).toBe("waiting");
    expect(waitStatus(sent, after(6.9))).toBe("waiting");
    expect(waitStatus(sent, after(7))).toBe("reminder_due");
    expect(waitStatus(sent, after(13.9))).toBe("reminder_due");
    expect(waitStatus(sent, after(14))).toBe("expired");
    expect(waitStatus(sent, after(16.9))).toBe("expired");
    expect(waitStatus(sent, after(17))).toBe("auto_withdraw_due");
  });
});

describe("what the candidate can do", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  it("offers only the legal next step for each state", () => {
    expect(linkedinActions(null, "SENT", now)).toMatchObject({ state: "NOT_STARTED", canSendRequest: true, canMarkAccepted: false, canMarkMessaged: false, canWithdraw: true });
    const pending = { state: "CONNECT_PENDING" as const, requestedAt: new Date("2026-11-09T00:00:00Z") };
    expect(linkedinActions(pending, "SENT", now)).toMatchObject({ canSendRequest: false, canMarkAccepted: true, canMarkMessaged: false, shouldWithdraw: false });
    expect(linkedinActions({ state: "ACCEPTED", requestedAt: null }, "SENT", now)).toMatchObject({ canMarkMessaged: true, canMarkAccepted: false });
    expect(linkedinActions({ state: "MESSAGED", requestedAt: null }, "SENT", now)).toMatchObject({ canWithdraw: false, canMarkMessaged: false });
    expect(linkedinActions({ state: "WITHDRAWN", requestedAt: null }, "SENT", now)).toMatchObject({ canSendRequest: false, canWithdraw: false });
  });
  it("prompts a withdrawal once the request has expired", () => {
    const old = { state: "CONNECT_PENDING" as const, requestedAt: new Date("2026-10-20T00:00:00Z") };
    expect(linkedinActions(old, "SENT", now).shouldWithdraw).toBe(true);
  });
  it("is frozen when the email lane ended (reply, opt-out, bounce, cancelled), except withdrawing", () => {
    for (const s of ["REPLIED", "OPTED_OUT", "BOUNCED", "CANCELLED"]) {
      const a = linkedinActions({ state: "CONNECT_PENDING", requestedAt: new Date("2026-11-09T00:00:00Z") }, s, now);
      expect(a.frozen).toBe(true);
      expect(a.canMarkAccepted).toBe(false);
      expect(a.canWithdraw).toBe(true);
    }
  });
});

describe("assisted mode only: there is no way to automate LinkedIn", () => {
  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", "generated", "tests"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("no source file fetches linkedin.com or imports a browser-automation / scraping library", async () => {
    const root = process.cwd();
    const files = [...(await walk(path.join(root, "lib"))), ...(await walk(path.join(root, "app"))), ...(await walk(path.join(root, "components")))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      const rel = path.relative(root, f);
      const specifiers = [...src.matchAll(/(?:from\s+|require\(\s*|import\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
      if (specifiers.some((s) => /^(puppeteer|playwright|selenium|cheerio|jsdom|linkedin-api|node-linkedin|phantomjs)/i.test(s))) offenders.push(`${rel}: automation/scraping library`);
      for (const line of src.split("\n")) {
        if (/\bfetch\s*\(/.test(line) && /linkedin\.com/i.test(line)) offenders.push(`${rel}: fetch to linkedin.com`);
      }
      // The only places a LinkedIn URL may appear are plain links the candidate opens themselves.
      if (/linkedin/i.test(src) && /(axios|got\(|undici|XMLHttpRequest)/.test(src)) offenders.push(`${rel}: http client near linkedin`);
    }
    expect(offenders).toEqual([]);
  });

  it("the package manifest contains no LinkedIn client or automation dependency", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /linkedin|puppeteer|selenium|cheerio|jsdom|phantom/i.test(d))).toEqual([]);
  });
});
