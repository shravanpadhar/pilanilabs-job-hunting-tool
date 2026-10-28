import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { buildMime, toBase64Url } from "@/lib/mime";
import { getRefreshToken } from "@/lib/providers/mailbox/accounts";
import type { ConnectResult, InboundMessage, MailboxProvider, OAuthStart, OutgoingMail, SentRef } from "@/lib/providers/mailbox/types";
import { PermanentMailError } from "@/lib/providers/mailbox/types";

/**
 * Gmail through Google's REST API with the candidate's own OAuth grant (spec decision 2, option A).
 * Scopes (minimal): openid + email (to learn the address), gmail.send (sensitive) and gmail.readonly (restricted, only
 * to read replies and bounces inside threads WE started). See the README for Google's verification process.
 * Mail content is used only to provide the feature the user sees; it is never stored beyond a short snippet and never sent to a model for training.
 */
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const accessCache = new Map<string, { token: string; expiresAt: number }>();

async function post(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form), signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw Object.assign(new Error(String(data.error_description ?? data.error ?? `HTTP ${res.status}`)), { status: res.status, oauthError: data.error });
  return data;
}

async function accessToken(accountId: string): Promise<string> {
  const cached = accessCache.get(accountId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const refresh = await getRefreshToken(accountId);
  try {
    const data = await post(TOKEN_URL, { client_id: env.googleClientId!, client_secret: env.googleClientSecret!, refresh_token: refresh, grant_type: "refresh_token" });
    const token = String(data.access_token);
    accessCache.set(accountId, { token, expiresAt: Date.now() + Number(data.expires_in ?? 3000) * 1000 });
    return token;
  } catch (err) {
    if ((err as { oauthError?: string }).oauthError === "invalid_grant") throw new PermanentMailError("Google access was revoked or expired. Please reconnect your Gmail.", "auth_revoked");
    throw err;
  }
}

async function gmail<T>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken(accountId)}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (res.status === 401) accessCache.delete(accountId);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const message = body.error?.message ?? `Gmail HTTP ${res.status}`;
    if (res.status === 400 && /recipient|address|invalid/i.test(message)) throw new PermanentMailError(message, "invalid_recipient");
    if (res.status === 401 || res.status === 403) throw new PermanentMailError("Gmail refused the request. Please reconnect your Gmail.", "auth_revoked");
    throw Object.assign(new Error(message), { status: res.status }); // 429 / 5xx: transient, retried by the sender
  }
  return (await res.json()) as T;
}

const header = (payload: { headers?: Array<{ name: string; value: string }> }, name: string) => payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

export class GmailMailbox implements MailboxProvider {
  readonly name = "gmail" as const;
  readonly scopes = SCOPES;

  authUrl(i: OAuthStart): string {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: env.googleClientId!, redirect_uri: i.redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent",
      include_granted_scopes: "true", state: i.state, code_challenge: i.codeChallenge, code_challenge_method: "S256", ...(i.loginHint ? { login_hint: i.loginHint } : {}),
    }).toString();
    return u.toString();
  }

  async exchangeCode(i: { code: string; codeVerifier: string; redirectUri: string }): Promise<ConnectResult> {
    const data = await post(TOKEN_URL, { client_id: env.googleClientId!, client_secret: env.googleClientSecret!, code: i.code, code_verifier: i.codeVerifier, redirect_uri: i.redirectUri, grant_type: "authorization_code" });
    const granted = String(data.scope ?? "").split(/\s+/);
    if (!granted.some((s) => s.endsWith("gmail.send"))) throw new AppError("You need to allow sending email for outreach to work. Please try connecting again and tick the permission.", 400, "scope_missing");
    if (!data.refresh_token) throw new AppError("Google did not return a long-lived grant. Remove the app at myaccount.google.com/permissions and connect again.", 400, "no_refresh_token");
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${String(data.access_token)}` }, signal: AbortSignal.timeout(15_000) });
    const profile = (await info.json().catch(() => ({}))) as { email?: string; email_verified?: boolean };
    if (!profile.email) throw new AppError("We could not read your Google email address.", 502, "no_email");
    return { refreshToken: String(data.refresh_token), accountEmail: profile.email, scopes: granted };
  }

  async send(accountId: string, mail: OutgoingMail): Promise<SentRef> {
    const raw = buildMime({ from: mail.from, to: mail.to, subject: mail.subject, text: mail.text, messageId: mail.messageId, attachments: mail.attachments, headers: { ...mail.headers, ...(mail.inReplyTo ? { "In-Reply-To": mail.inReplyTo, References: mail.inReplyTo } : {}) } });
    const res = await gmail<{ id: string; threadId: string }>(accountId, "/messages/send", { method: "POST", body: JSON.stringify({ raw: toBase64Url(raw), ...(mail.threadId ? { threadId: mail.threadId } : {}) }) });
    return { providerMessageId: res.id, threadId: res.threadId };
  }

  /**
   * Crash recovery. Gmail may rewrite the Message-ID, so we search our Sent folder for mail to this recipient since the
   * claim and compare our X-Pilani-Send-Key header (custom headers are preserved). Verify this against a real account before launch.
   */
  async findSent(accountId: string, q: { to: string; sinceMs: number; sendKey: string; messageId: string }): Promise<SentRef | null> {
    const after = Math.floor((q.sinceMs - 60_000) / 1000);
    const list = await gmail<{ messages?: Array<{ id: string; threadId: string }> }>(accountId, `/messages?q=${encodeURIComponent(`in:sent to:${q.to} after:${after}`)}&maxResults=10`);
    for (const m of list.messages ?? []) {
      const full = await gmail<{ payload?: { headers?: Array<{ name: string; value: string }> } }>(accountId, `/messages/${m.id}?format=metadata&metadataHeaders=X-Pilani-Send-Key&metadataHeaders=Message-ID`);
      if (header(full.payload ?? {}, "X-Pilani-Send-Key") === q.sendKey || header(full.payload ?? {}, "Message-ID") === q.messageId) return { providerMessageId: m.id, threadId: m.threadId };
    }
    return null;
  }

  /** Reads ONLY the threads we started, never the rest of the inbox. */
  async pollThreads(accountId: string, threadIds: string[], cursor: string | null): Promise<{ messages: InboundMessage[]; cursor: string | null }> {
    const after = cursor ? Number(cursor) : 0;
    const messages: InboundMessage[] = [];
    let newest = after;
    for (const threadId of threadIds.slice(0, 100)) {
      const t = await gmail<{ messages?: Array<{ id: string; internalDate?: string; snippet?: string; labelIds?: string[]; payload?: { headers?: Array<{ name: string; value: string }>; mimeType?: string; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> } }> }>(accountId, `/threads/${threadId}?format=full`);
      for (const m of t.messages ?? []) {
        const at = Number(m.internalDate ?? 0);
        if (at <= after || m.labelIds?.includes("SENT")) continue;
        const plain = m.payload?.mimeType === "text/plain" ? m.payload.body?.data : m.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data;
        const text = plain ? Buffer.from(plain, "base64url").toString("utf8") : (m.snippet ?? "");
        const headers: Record<string, string> = {};
        for (const h of ["From", "Auto-Submitted", "X-Autoreply", "Precedence", "X-Failed-Recipients", "Content-Type", "Return-Path"]) headers[h] = header(m.payload ?? {}, h);
        messages.push({ providerMessageId: m.id, threadId, from: headers.From, receivedAt: new Date(at), snippet: (m.snippet ?? "").slice(0, 300), text: text.slice(0, 8000), headers });
        newest = Math.max(newest, at);
      }
    }
    return { messages, cursor: String(newest) };
  }

  async revoke(accountId: string): Promise<void> {
    try {
      const token = await getRefreshToken(accountId);
      await post("https://oauth2.googleapis.com/revoke", { token });
    } catch (err) {
      log.warn("gmail_revoke_failed", { message: (err as Error).message });
    }
    accessCache.delete(accountId);
  }
}
