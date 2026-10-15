import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  alertFrequency: z.enum(["OFF", "DAILY", "WEEKLY"]).optional(),
  alertEmail: z.boolean().optional(),
  alertWhatsapp: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler("saved_search_patch", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const data = patchSchema.parse(await request.json());
  const res = await db.savedSearch.updateMany({ where: { id, userId: user.id }, data });
  if (res.count === 0) throw notFound("Saved search");
  return NextResponse.json({ ok: true });
});

export const DELETE = handler("saved_search_delete", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const res = await db.savedSearch.deleteMany({ where: { id, userId: user.id } });
  if (res.count === 0) throw notFound("Saved search");
  return NextResponse.json({ ok: true });
});
