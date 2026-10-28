import { afterEach, describe, expect, it } from "vitest";
import { outreach } from "@/config/outreach";
import { buildMime, encodeWord, safeHeader } from "@/lib/mime";
import { judgeHealth } from "@/lib/outreach/health";
import { decideSend, type SendSnapshot } from "@/lib/outreach/policy";
import { inWorkingHours, zonedParts, zonedToUtc } from "@/lib/outreach/schedule";
import { effectiveDailyCap, warmupCap, warmupStageFor } from "@/lib/outreach/warmup";
import { GmailMailbox } from "@/lib/providers/mailbox/gmail";
import { FakeMailbox, fakeMailbox } from "@/lib/providers/mailbox/fake";

const IST = "Asia/Kolkata";
const WED_11AM = zonedToUtc(2026, 11, 4, 11, 0, IST); // inside working hours

const snap = (over: Partial<SendSnapshot> = {}): SendSnapshot => ({
  now: WED_11AM, message: { id: "m1", step: 1 }, campaignStatus: "ACTIVE", targetState: "SCHEDULED", hasReply: false, suppressed: false, targetSendable: true, regionBlocked: false,
  recipientTz: IST, sendingEnabled: true, sendingPaused: false, mailboxActive: true, sentToday: 0, dailyCap: 10, lastMailboxSendAt: null, candidateTz: IST, prev: null, ...over,
});

describe("send-time policy: hard stops cancel the message for good", () => {
  it("a clean snapshot sends", () => expect(decideSend(snap())).toEqual({ action: "send" }));

  it.each([
    [{ hasReply: true }, "replied"],
    [{ targetState: "REPLIED" }, "replied"],
    [{ targetState: "BOUNCED" }, "target_bounced"],
    [{ targetState: "OPTED_OUT" }, "target_opted_out"],
    [{ targetState: "CANCELLED" }, "target_cancelled"],
    [{ campaignStatus: "CANCELLED" }, "campaign_closed"],
    [{ campaignStatus: "COMPLETED" }, "campaign_closed"],
    [{ suppressed: true }, "suppressed"],
    [{ regionBlocked: true }, "blocked_region"],
    [{ targetSendable: false }, "not_sendable"],
    [{ message: { id: "m2", step: 2 }, prev: { state: "CANCELLED", sentAt: null } }, "previous_step_not_sent"],
    [{ message: { id: "m2", step: 2 }, prev: { state: "FAILED", sentAt: null } }, "previous_step_not_sent"],
  ] as Array<[Partial<SendSnapshot>, string]>)("%j -> cancel %s", (patch, reason) => {
    expect(decideSend(snap(patch))).toEqual({ action: "cancel", reason });
  });

  it("a hard stop wins over every hold, even when the mailbox is paused and it is the middle of the night", () => {
    const d = decideSend(snap({ hasReply: true, sendingPaused: true, sendingEnabled: false, now: zonedToUtc(2026, 11, 7, 3, 0, IST) }));
    expect(d).toEqual({ action: "cancel", reason: "replied" });
  });
});

describe("send-time policy: holds reschedule instead of failing", () => {
  const held = (patch: Partial<SendSnapshot>) => {
    const d = decideSend(snap(patch));
    expect(d.action).toBe("hold");
    return d as Extract<ReturnType<typeof decideSend>, { action: "hold" }>;
  };

  it("kill switch, paused campaign, paused sending and a missing mailbox all hold for an hour", () => {
    expect(held({ sendingEnabled: false }).reason).toBe("sending_disabled");
    expect(held({ campaignStatus: "PAUSED" }).reason).toBe("campaign_paused");
    expect(held({ sendingPaused: true }).reason).toBe("sending_paused");
    expect(held({ mailboxActive: false }).reason).toBe("mailbox_inactive");
    expect(held({ sendingPaused: true }).until.getTime() - WED_11AM.getTime()).toBe(3_600_000);
  });

  it("outside the recipient's working hours it waits for the next window (never sends at night or on weekends)", () => {
    for (const at of [zonedToUtc(2026, 11, 4, 20, 0, IST), zonedToUtc(2026, 11, 4, 6, 0, IST), zonedToUtc(2026, 11, 7, 11, 0, IST), zonedToUtc(2026, 11, 8, 11, 0, IST)]) {
      const d = held({ now: at });
      expect(d.reason).toBe("outside_recipient_hours");
      expect(inWorkingHours(d.until, IST)).toBe(true);
      expect(d.until.getTime()).toBeGreaterThan(at.getTime());
    }
  });

  it("uses the RECIPIENT's zone, not the candidate's", () => {
    // 11:00 IST on a Wednesday is 00:30 in New York: fine for the candidate, not for the recipient.
    const d = held({ recipientTz: "America/New_York" });
    expect(d.reason).toBe("outside_recipient_hours");
    expect(zonedParts(d.until, "America/New_York").h).toBeGreaterThanOrEqual(9);
  });

  it("the daily cap pushes the send to the next day's working hours", () => {
    const d = held({ sentToday: 10, dailyCap: 10 });
    expect(d.reason).toBe("daily_cap");
    expect(zonedParts(d.until, IST).d).toBe(5);
    expect(decideSend(snap({ sentToday: 9, dailyCap: 10 })).action).toBe("send");
    expect(held({ dailyCap: 0 }).reason).toBe("daily_cap");
  });

  it("spacing keeps sends from the same mailbox apart", () => {
    const d = held({ lastMailboxSendAt: new Date(WED_11AM.getTime() - 60_000) });
    expect(d.reason).toBe("spacing");
    expect(d.until.getTime() - (WED_11AM.getTime() - 60_000)).toBeGreaterThanOrEqual(outreach.minSpacingMinutes * 60_000);
    expect(decideSend(snap({ lastMailboxSendAt: new Date(WED_11AM.getTime() - 3_600_000) })).action).toBe("send");
  });

  it("a follow-up waits for the previous step and for the per-recipient gap", () => {
    const step2 = { message: { id: "m2", step: 2 } };
    expect(held({ ...step2, prev: { state: "SCHEDULED", sentAt: null } }).reason).toBe("previous_step_pending");
    expect(held({ ...step2, prev: { state: "SENT", sentAt: new Date(WED_11AM.getTime() - 3_600_000) } }).reason).toBe("recipient_frequency");
    expect(decideSend(snap({ ...step2, prev: { state: "SENT", sentAt: new Date(WED_11AM.getTime() - 3 * 86_400_000) } })).action).toBe("send");
  });
});

describe("warm-up ramp", () => {
  const connected = new Date("2026-11-01T00:00:00Z");
  const at = (days: number) => new Date(connected.getTime() + days * 86_400_000);
  it("starts at 5 a day and rises over two weeks", () => {
    expect([0, 2, 3, 6, 7, 13, 14, 60].map((d) => warmupCap(connected, at(d)))).toEqual([5, 5, 10, 10, 20, 20, 30, 30]);
    expect(warmupStageFor(connected, at(0))).toBe(0);
    expect(warmupStageFor(connected, at(14))).toBe(3);
  });
  it("the candidate's own cap and the hard ceiling both apply", () => {
    expect(effectiveDailyCap({ dailySendCap: 3, connectedAt: connected }, at(30))).toBe(3);
    expect(effectiveDailyCap({ dailySendCap: 100, connectedAt: connected }, at(30))).toBe(outreach.hardMaxDailySends);
    expect(effectiveDailyCap({ dailySendCap: 20, connectedAt: connected }, at(0))).toBe(5);
  });
});

describe("auto-pause thresholds", () => {
  it("pauses on a high bounce rate, but only once the sample is big enough", () => {
    expect(judgeHealth({ sent: 20, bounces: 2, complaints: 0 }).pause).toBe(true); // 10%
    expect(judgeHealth({ sent: 100, bounces: 5, complaints: 0 }).pause).toBe(false); // exactly 5% is not above
    expect(judgeHealth({ sent: 100, bounces: 6, complaints: 0 }).pause).toBe(true);
    expect(judgeHealth({ sent: 10, bounces: 5, complaints: 0 }).pause).toBe(false); // too few sends to judge
  });
  it("pauses on complaints", () => {
    expect(judgeHealth({ sent: 5, bounces: 0, complaints: 2 }).pause).toBe(true); // two complaints always pause
    expect(judgeHealth({ sent: 200, bounces: 0, complaints: 1 }).pause).toBe(true); // 0.5% > 0.3%
    expect(judgeHealth({ sent: 400, bounces: 0, complaints: 1 }).pause).toBe(false); // 0.25%
    expect(judgeHealth({ sent: 50, bounces: 0, complaints: 0 })).toEqual({ pause: false, reason: null });
    expect(judgeHealth({ sent: 20, bounces: 2, complaints: 0 }).reason).toMatch(/bounce rate/);
  });
});

describe("MIME builder", () => {
  const base = { from: { name: "Asha Verma", email: "asha@gmail.test" }, to: "aarav@acme.test", subject: "Hello", text: "Body line 1\nBody line 2", messageId: "<abc@gmail.test>" };
  const decodeBody = (mime: string) => Buffer.from(mime.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");

  it("builds a plain-text message whose body decodes to exactly the approved text", () => {
    const mime = buildMime(base);
    expect(mime).toContain("Subject: Hello");
    expect(mime).toContain("Message-ID: <abc@gmail.test>");
    expect(mime).toContain('From: "Asha Verma" <asha@gmail.test>');
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(decodeBody(mime)).toBe("Body line 1\r\nBody line 2");
  });
  it("carries custom headers and a base64 attachment inside multipart/mixed", () => {
    const pdf = Buffer.from("%PDF-1.4 fake");
    const mime = buildMime({ ...base, headers: { "List-Unsubscribe": "<https://x.test/u>", "X-Pilani-Send-Key": "k" }, attachments: [{ filename: "resume.pdf", contentType: "application/pdf", bytes: pdf }] });
    expect(mime).toContain("multipart/mixed");
    expect(mime).toContain("List-Unsubscribe: <https://x.test/u>");
    expect(mime).toContain('filename="resume.pdf"');
    expect(mime).toContain(pdf.toString("base64"));
  });
  it("encodes non-ASCII names and subjects (RFC 2047)", () => {
    expect(encodeWord("Zoë")).toMatch(/^=\?UTF-8\?B\?/);
    expect(buildMime({ ...base, subject: "Frage zur Stelle ü", from: { name: "Zoë Müller", email: "z@x.test" } })).not.toMatch(/[^\x00-\x7f]/);
  });
  it("refuses header injection in every field", () => {
    expect(() => safeHeader("a\r\nBcc: evil@x.test")).toThrow();
    expect(() => buildMime({ ...base, subject: "Hi\r\nBcc: evil@x.test" })).toThrow();
    expect(() => buildMime({ ...base, to: "a@b.test\r\nBcc: evil@x.test" })).toThrow();
    expect(() => buildMime({ ...base, from: { name: "X\nBcc: e@x.test", email: "z@x.test" } })).toThrow();
    expect(() => buildMime({ ...base, headers: { "X-Test": "a\nBcc: e@x.test" } })).toThrow();
    expect(() => buildMime({ ...base, headers: { "Bad Name": "v" } })).toThrow();
    expect(() => buildMime({ ...base, to: "not-an-address" })).toThrow();
  });
});

describe("mailbox providers", () => {
  const saved = { id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  afterEach(() => {
    if (saved.id === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = saved.id;
    if (saved.secret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = saved.secret;
  });

  it("the Gmail consent URL uses PKCE, offline access and ONLY the minimal scopes, and never contains the client secret", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id-123";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "super-secret-value";
    const url = new URL(new GmailMailbox().authUrl({ state: "st", codeChallenge: "ch", redirectUri: "https://app.example.com/api/connect/gmail/callback", loginHint: "a@b.test" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("scope")!.split(" ").sort()).toEqual(["email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid"]);
    expect(url.toString()).not.toContain("super-secret-value");
  });

  it("the fake mailbox records sends, simulates failures and replays inbound mail", async () => {
    fakeMailbox.reset();
    const mb = new FakeMailbox();
    const mail = { from: { name: "A", email: "a@x.test" }, to: "b@y.test", subject: "S", text: "T", attachments: [], messageId: "<1@x.test>", headers: { "X-Pilani-Send-Key": "key1" } };
    const ref = await mb.send("acct", mail);
    expect(fakeMailbox.sent).toHaveLength(1);
    expect(await mb.findSent("acct", { to: "b@y.test", sinceMs: 0, sendKey: "key1", messageId: "<other>" })).toEqual(ref);
    expect(await mb.findSent("acct", { to: "b@y.test", sinceMs: 0, sendKey: "nope", messageId: "<other>" })).toBeNull();
    fakeMailbox.failNext("transient", "permanent");
    await expect(mb.send("acct", mail)).rejects.toThrow(/transient/);
    await expect(mb.send("acct", mail)).rejects.toMatchObject({ code: "invalid_recipient" });
    fakeMailbox.injectInbound(ref.threadId, { from: "b@y.test", text: "Thanks!" });
    const polled = await mb.pollThreads("acct", [ref.threadId], null);
    expect(polled.messages).toHaveLength(1);
    expect((await mb.pollThreads("acct", [ref.threadId], polled.cursor)).messages).toHaveLength(0); // cursor advances
  });
});
