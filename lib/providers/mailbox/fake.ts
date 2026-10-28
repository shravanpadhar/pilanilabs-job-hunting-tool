import { createHash, randomBytes } from "node:crypto";
import type { ConnectResult, InboundMessage, MailboxProvider, OAuthStart, OutgoingMail, SentRef } from "@/lib/providers/mailbox/types";
import { PermanentMailError } from "@/lib/providers/mailbox/types";

/**
 * In-memory mailbox for local development and every test: no Google account needed. It records what "would have been
 * sent", lets tests inject replies and bounces into a thread, and can simulate a transient failure, a permanent
 * failure, or a crash right after the provider accepted the message (to prove the send ledger prevents duplicates).
 * State lives on globalThis so it survives Next.js module reloads in dev.
 */
export interface FakeSent extends OutgoingMail {
  accountId: string;
  providerMessageId: string;
  threadId: string;
  sentAt: Date;
}

interface FakeState {
  sent: FakeSent[];
  inbound: Map<string, InboundMessage[]>;
  failures: Array<"transient" | "permanent" | "crash_after_send">;
  counter: number;
}

// Ids carry a random per-process prefix so they stay globally unique, like real provider ids, even after reset().
const RUN = randomBytes(3).toString("hex");
const g = globalThis as unknown as { __fakeMailbox?: FakeState };
const state = (): FakeState => (g.__fakeMailbox ??= { sent: [], inbound: new Map(), failures: [], counter: 0 });

export const fakeMailbox = {
  get sent() {
    return state().sent;
  },
  reset() {
    g.__fakeMailbox = { sent: [], inbound: new Map(), failures: [], counter: 0 };
  },
  /** Queue failures for the next send() calls, in order. */
  failNext(...kinds: FakeState["failures"]) {
    state().failures.push(...kinds);
  },
  injectInbound(threadId: string, m: Partial<InboundMessage> & { text: string; from: string }) {
    const s = state();
    s.counter++;
    const msg: InboundMessage = {
      providerMessageId: m.providerMessageId ?? `fake-in-${RUN}-${s.counter}-${randomBytes(2).toString("hex")}`, threadId, from: m.from, receivedAt: m.receivedAt ?? new Date(),
      snippet: m.snippet ?? m.text.slice(0, 300), text: m.text, headers: m.headers ?? {},
    };
    s.inbound.set(threadId, [...(s.inbound.get(threadId) ?? []), msg]);
    return msg;
  },
};

export class FakeMailbox implements MailboxProvider {
  readonly name = "fake" as const;
  readonly scopes = ["openid", "email", "gmail.send", "gmail.readonly"];

  authUrl(i: OAuthStart): string {
    // Skips a consent screen: goes straight back to our callback with a code.
    return `${i.redirectUri}?code=fake-${randomBytes(6).toString("hex")}&state=${encodeURIComponent(i.state)}`;
  }

  async exchangeCode(): Promise<ConnectResult> {
    return { refreshToken: `fake-refresh-${randomBytes(8).toString("hex")}`, accountEmail: process.env.FAKE_MAILBOX_EMAIL ?? "candidate@gmail.test", scopes: this.scopes };
  }

  async send(accountId: string, mail: OutgoingMail): Promise<SentRef> {
    const s = state();
    const failure = s.failures.shift();
    if (failure === "transient") throw new Error("Simulated transient mail failure (503)");
    if (failure === "permanent") throw new PermanentMailError("Simulated: the address does not exist", "invalid_recipient");
    s.counter++;
    const threadId = mail.threadId ?? `fake-thread-${RUN}-${s.counter}-${randomBytes(2).toString("hex")}`;
    const providerMessageId = `fake-msg-${RUN}-${s.counter}-${randomBytes(2).toString("hex")}`;
    s.sent.push({ ...mail, accountId, providerMessageId, threadId, sentAt: new Date() });
    if (failure === "crash_after_send") throw new Error("Simulated crash after the provider accepted the message");
    return { providerMessageId, threadId };
  }

  async findSent(_accountId: string, q: { to: string; sinceMs: number; sendKey: string; messageId: string }): Promise<SentRef | null> {
    const hit = state().sent.find((m) => m.headers["X-Pilani-Send-Key"] === q.sendKey || m.messageId === q.messageId);
    return hit ? { providerMessageId: hit.providerMessageId, threadId: hit.threadId } : null;
  }

  async pollThreads(_accountId: string, threadIds: string[], cursor: string | null) {
    const after = cursor ? Number(cursor) : 0;
    const messages = threadIds.flatMap((t) => state().inbound.get(t) ?? []).filter((m) => m.receivedAt.getTime() > after);
    const newest = messages.reduce((n, m) => Math.max(n, m.receivedAt.getTime()), after);
    return { messages, cursor: String(newest) };
  }

  async revoke(): Promise<void> {
    /* nothing to revoke */
  }
}

export const sendKeyDigest = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
