import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, handler } from "@/lib/errors";
import { alertSettingsSchema } from "@/lib/validation";

/** Account-level "top new matches" digest settings. */
export const PUT = handler("alerts_put", async (request: Request) => {
  const user = await requireUserApi();
  const data = alertSettingsSchema.parse(await request.json());
  if (data.alertFrequency !== "OFF" && !data.alertEmail && !data.alertWhatsapp) {
    throw new AppError("Choose at least one channel (email or WhatsApp).", 400, "no_channel");
  }
  if (data.alertWhatsapp && !data.whatsappNumber) throw new AppError("Add your WhatsApp number (with country code) to get WhatsApp alerts.", 400, "no_number");

  const saved = await db.preferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
    select: { alertFrequency: true, alertEmail: true, alertWhatsapp: true, whatsappNumber: true, alertMinScore: true },
  });
  return NextResponse.json(saved);
});
