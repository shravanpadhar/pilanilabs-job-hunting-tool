import { NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail, sendWhatsapp } from "@/lib/alerts/channels";
import { renderDigestEmail, renderDigestWhatsapp } from "@/lib/alerts/render";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, handler } from "@/lib/errors";
import { jobCardSelect } from "@/lib/jobs/query";

const bodySchema = z.object({ channel: z.enum(["email", "whatsapp"]) });

/** Sends the signed-in user one sample alert (their best current match) so they can check delivery. */
export const POST = handler("alerts_test", async (request: Request) => {
  const user = await requireUserApi();
  const { channel } = bodySchema.parse(await request.json());

  const top = await db.match.findMany({ where: { userId: user.id }, orderBy: { score: "desc" }, take: 3, select: { score: true, reason: true, job: { select: jobCardSelect } } });
  const jobs = top.map((m) => ({ ...m.job, score: m.score, reason: m.reason }));
  if (!jobs.length) throw new AppError("You don't have any matches yet — finish onboarding first.", 400, "no_matches");

  if (channel === "email") {
    const { html, text } = renderDigestEmail({ title: "Test alert from Pilanilabs", jobs });
    const r = await sendEmail({ to: user.email, subject: "Test alert from Pilanilabs", html, text });
    if (r.skipped) throw new AppError("Email isn't configured on this server (RESEND_API_KEY).", 503, "email_off");
    if (!r.ok) throw new AppError(`Email failed: ${r.detail ?? "unknown error"}`, 502, "email_failed");
    return NextResponse.json({ ok: true, to: user.email });
  }

  const prefs = await db.preferences.findUnique({ where: { userId: user.id }, select: { whatsappNumber: true } });
  if (!prefs?.whatsappNumber) throw new AppError("Save your WhatsApp number first.", 400, "no_number");
  const r = await sendWhatsapp({ to: prefs.whatsappNumber, body: renderDigestWhatsapp({ title: "Test alert from Pilanilabs", jobs }) });
  if (r.skipped) throw new AppError("WhatsApp isn't configured on this server (Twilio).", 503, "whatsapp_off");
  if (!r.ok) throw new AppError(`WhatsApp failed: ${r.detail ?? "unknown error"}`, 502, "whatsapp_failed");
  return NextResponse.json({ ok: true, to: prefs.whatsappNumber });
});
