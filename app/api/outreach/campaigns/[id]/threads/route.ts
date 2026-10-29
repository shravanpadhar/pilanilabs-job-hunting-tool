import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { loadThreads } from "@/lib/outreach/threads";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler("outreach_threads", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { id } = await params;
  return NextResponse.json(await loadThreads(user.id, id));
});
