import { sendEmail, sendWhatsapp, type SendResult } from "@/lib/alerts/channels";
import { flags } from "@/lib/env";

/**
 * Notifies the candidate (spec journey 3): email through Resend, WhatsApp through Twilio. The fake records what would have
 * been sent, so tests and local development need no keys. Content is a short preview; the full reply stays in Gmail.
 */
export interface Notification {
  to: { email: string | null; whatsapp: string | null };
  subject: string;
  text: string;
  html: string;
}

export interface NotifyResult {
  email: SendResult | null;
  whatsapp: SendResult | null;
}

export interface Notifier {
  readonly name: "real" | "fake";
  send(n: Notification): Promise<NotifyResult>;
}

const g = globalThis as unknown as { __fakeNotifications?: Notification[] };
export const fakeNotifications = {
  get sent() {
    return (g.__fakeNotifications ??= []);
  },
  reset() {
    g.__fakeNotifications = [];
  },
};

class FakeNotifier implements Notifier {
  readonly name = "fake" as const;
  async send(n: Notification): Promise<NotifyResult> {
    fakeNotifications.sent.push(n);
    return { email: n.to.email ? { ok: true } : null, whatsapp: n.to.whatsapp ? { ok: true } : null };
  }
}

class RealNotifier implements Notifier {
  readonly name = "real" as const;
  async send(n: Notification): Promise<NotifyResult> {
    return {
      email: n.to.email ? await sendEmail({ to: n.to.email, subject: n.subject, html: n.html, text: n.text }) : null,
      whatsapp: n.to.whatsapp ? await sendWhatsapp({ to: n.to.whatsapp, body: `${n.subject}\n${n.text}`.slice(0, 900) }) : null,
    };
  }
}

let override: Notifier | null = null;
export function setNotifierForTests(n: Notifier | null) {
  override = n;
}

/** Real channels when any is configured, otherwise the recording fake. */
export function getNotifier(): Notifier {
  if (override) return override;
  return flags.email || flags.whatsapp ? new RealNotifier() : new FakeNotifier();
}
