import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { preferencesSchema } from "@/lib/validation";

export const GET = handler("preferences_get", async () => {
  const user = await requireUserApi();
  const prefs = await db.preferences.findUnique({ where: { userId: user.id } });
  return NextResponse.json(prefs);
});

export const PUT = handler("preferences_put", async (request: Request) => {
  const user = await requireUserApi();
  const data = preferencesSchema.parse(await request.json());
  const saved = await db.preferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return NextResponse.json(saved);
});
