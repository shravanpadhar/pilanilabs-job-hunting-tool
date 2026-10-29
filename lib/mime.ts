import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";

/**
 * Minimal RFC 5322 / MIME builder for outgoing plain-text email with an optional attachment.
 * Header values can never contain CR or LF (header injection); non-ASCII subjects and names are RFC 2047 encoded;
 * the body is sent as UTF-8 base64 so no character set or line-length problem can corrupt the approved text.
 */
export interface MimeAttachment {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface MimeInput {
  from: { name: string; email: string };
  to: string;
  subject: string;
  text: string;
  date?: Date;
  messageId: string; // with angle brackets
  headers?: Record<string, string>;
  attachments?: MimeAttachment[];
}

export function safeHeader(value: string, what = "header"): string {
  if (/[\r\n]/.test(value)) throw new AppError(`Invalid ${what}: line breaks are not allowed.`, 400, "bad_header");
  return value;
}

const needsEncoding = (s: string) => /[^\x20-\x7e]/.test(s);
export const encodeWord = (s: string) => (needsEncoding(s) ? `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=` : s);
const quoteName = (name: string) => (needsEncoding(name) ? encodeWord(name) : `"${name.replace(/(["\\])/g, "\\$1")}"`);
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();

export function buildMime(i: MimeInput): string {
  safeHeader(i.from.email, "From address");
  safeHeader(i.to, "To address");
  safeHeader(i.subject, "Subject");
  safeHeader(i.messageId, "Message-ID");
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(i.to)) throw new AppError("Invalid recipient address.", 400, "bad_header");

  const boundary = `=_pl_${randomBytes(12).toString("hex")}`;
  const lines: string[] = [
    `From: ${quoteName(safeHeader(i.from.name, "From name"))} <${i.from.email}>`,
    `To: <${i.to}>`,
    `Subject: ${encodeWord(i.subject)}`,
    `Date: ${(i.date ?? new Date()).toUTCString()}`,
    `Message-ID: ${i.messageId}`,
    "MIME-Version: 1.0",
  ];
  for (const [k, v] of Object.entries(i.headers ?? {})) {
    if (!/^[A-Za-z0-9-]+$/.test(k)) throw new AppError("Invalid header name.", 400, "bad_header");
    lines.push(`${k}: ${safeHeader(v, k)}`);
  }
  const textPart = [`Content-Type: text/plain; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(i.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"))];

  if (!i.attachments?.length) return [...lines, ...textPart].join("\r\n") + "\r\n";

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
  const parts: string[] = [`--${boundary}`, ...textPart];
  for (const a of i.attachments) {
    const name = safeHeader(a.filename.replace(/["\\]/g, "_"), "attachment name");
    parts.push(`--${boundary}`, `Content-Type: ${safeHeader(a.contentType)}; name="${name}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${name}"`, "", wrap76(a.bytes.toString("base64")));
  }
  parts.push(`--${boundary}--`);
  return [...lines, ...parts].join("\r\n") + "\r\n";
}

export const toBase64Url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
