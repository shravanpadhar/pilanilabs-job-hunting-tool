import { Resend } from "resend";
import { env, flags } from "@/lib/env";
import { log } from "@/lib/logger";

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  detail?: string;
}

/** Email via Resend (https://resend.com/docs/api-reference/emails/send-email). */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  if (!flags.email) return { ok: false, skipped: true, detail: "RESEND_API_KEY not set" };
  try {
    const resend = new Resend(env.resendKey);
    const { error } = await resend.emails.send({
      from: env.resendFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: { "List-Unsubscribe": `<${env.appUrl}/searches>` },
    });
    if (error) return { ok: false, detail: error.message };
    return { ok: true };
  } catch (err) {
    log.error("email_send_failed", err);
    return { ok: false, detail: (err as Error).message };
  }
}

/**
 * WhatsApp via Twilio (https://www.twilio.com/docs/whatsapp/api).
 * Business-initiated messages outside a 24h user session must use an approved template:
 * set TWILIO_WHATSAPP_CONTENT_SID (template with one variable {{1}} = the digest text). In the
 * Twilio sandbox, recipients must first send the join code and free-form Body messages work.
 */
export async function sendWhatsapp(input: { to: string; body: string }): Promise<SendResult> {
  if (!flags.whatsapp) return { ok: false, skipped: true, detail: "Twilio WhatsApp not configured" };
  const form = new URLSearchParams({ From: env.twilioWhatsappFrom!.startsWith("whatsapp:") ? env.twilioWhatsappFrom! : `whatsapp:${env.twilioWhatsappFrom}`, To: `whatsapp:${input.to}` });
  if (env.twilioContentSid) {
    form.set("ContentSid", env.twilioContentSid);
    form.set("ContentVariables", JSON.stringify({ "1": input.body.replace(/\s*\n\s*/g, " ").slice(0, 900) }));
  } else {
    form.set("Body", input.body.slice(0, 1500));
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, detail: body.message ?? `Twilio HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    log.error("whatsapp_send_failed", err);
    return { ok: false, detail: (err as Error).message };
  }
}
