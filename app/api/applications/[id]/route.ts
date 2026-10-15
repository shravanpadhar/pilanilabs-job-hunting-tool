import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";
import { applicationStatusSchema } from "@/lib/validation";

const patchSchema = z.object({
  status: applicationStatusSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  followUpDate: z.string().date().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler("application_patch", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const body = patchSchema.parse(await request.json());

  const app = await db.application.findFirst({ where: { id, userId: user.id } });
  if (!app) throw notFound("Application");

  let position: number | undefined;
  if (body.status && body.status !== app.status) {
    const last = await db.application.aggregate({ where: { userId: user.id, status: body.status }, _max: { position: true } });
    position = (last._max.position ?? 0) + 1;
  }
  const updated = await db.application.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status, ...(position !== undefined ? { position } : {}) } : {}),
      ...(body.status === "APPLIED" && !app.appliedAt ? { appliedAt: new Date() } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.followUpDate !== undefined ? { followUpDate: body.followUpDate ? new Date(`${body.followUpDate}T09:00:00.000Z`) : null } : {}),
    },
  });
  return NextResponse.json(updated);
});

export const DELETE = handler("application_delete", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  const res = await db.application.deleteMany({ where: { id, userId: user.id } });
  if (res.count === 0) throw notFound("Application");
  return NextResponse.json({ ok: true });
});
