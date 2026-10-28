import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { getOutreachProfile, isProfileComplete, saveOutreachProfile } from "@/lib/outreach/profile";

export const runtime = "nodejs";

export const GET = handler("outreach_profile_get", async () => {
  const user = await requireUserApi();
  const p = await getOutreachProfile(user.id);
  return NextResponse.json({ complete: isProfileComplete(p), senderName: p?.senderName ?? "", postalAddress: p?.postalAddress ?? "", timeZone: p?.timeZone ?? "Asia/Kolkata", notifyEmail: p?.notifyEmail ?? true, notifyWhatsapp: p?.notifyWhatsapp ?? false, whatsappNumber: p?.whatsappNumber ?? "" });
});

export const PUT = handler("outreach_profile_save", async (request: Request) => {
  const user = await requireUserApi();
  const saved = await saveOutreachProfile(user.id, await request.json());
  return NextResponse.json({ complete: isProfileComplete(saved) });
});
