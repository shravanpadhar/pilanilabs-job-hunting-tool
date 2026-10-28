import type { MimeAttachment } from "@/lib/mime";

/**
 * The candidate's own mailbox, behind one interface so Outlook (Microsoft Graph) can be added later (spec section 7).
 * No SMTP, no app passwords: OAuth only, with the minimum scopes.
 */
export interface OAuthStart {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  loginHint?: string;
}

export interface ConnectResult {
  refreshToken: string;
  accountEmail: string;
  scopes: string[];
}

export interface OutgoingMail {
  from: { name: string; email: string };
  to: string;
  subject: string;
  text: string;
  attachments: MimeAttachment[];
  /** RFC Message-ID we generate (with angle brackets), derived from the approval's send key. */
  messageId: string;
  /** Extra headers: List-Unsubscribe, List-Unsubscribe-Post, X-Pilani-Send-Key. */
  headers: Record<string, string>;
  /** Follow-ups continue the same conversation. */
  threadId?: string | null;
  inReplyTo?: string | null;
}

export interface SentRef {
  providerMessageId: string;
  threadId: string;
}

/** A message that arrived in a thread we started (reply, bounce notice, or auto-reply). */
export interface InboundMessage {
  providerMessageId: string;
  threadId: string;
  from: string;
  receivedAt: Date;
  snippet: string;
  /** Plain-text body, only held in memory for classification; never stored (D-15). */
  text: string;
  headers: Record<string, string>;
}

export interface MailboxProvider {
  readonly name: "gmail" | "fake";
  /** The scopes this provider asks for, in the order shown on the consent screen. */
  readonly scopes: string[];
  authUrl(input: OAuthStart): string;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<ConnectResult>;
  send(accountId: string, mail: OutgoingMail): Promise<SentRef>;
  /** Used for crash recovery: was this exact message already sent? Matches on our send key header / Message-ID. */
  findSent(accountId: string, q: { to: string; sinceMs: number; sendKey: string; messageId: string }): Promise<SentRef | null>;
  /** New inbound messages in the given threads since the stored cursor (Phase 5 reply poller). */
  pollThreads(accountId: string, threadIds: string[], cursor: string | null): Promise<{ messages: InboundMessage[]; cursor: string | null }>;
  revoke(accountId: string): Promise<void>;
}

/** Thrown for failures that retrying cannot fix (bad address, revoked token): the message is marked FAILED, not retried. */
export class PermanentMailError extends Error {
  constructor(message: string, public code: "invalid_recipient" | "auth_revoked" | "rejected") {
    super(message);
    this.name = "PermanentMailError";
  }
}
