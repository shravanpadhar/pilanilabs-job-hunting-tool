import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { previewSchedule } from "@/lib/outreach/preview";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Which email goes when, in the candidate's time zone and in each recipient's. Read-only. */
export const GET = handler("outreach_schedule_preview", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  return NextResponse.json(await previewSchedule(user.id, id));
});
