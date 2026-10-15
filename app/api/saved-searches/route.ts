import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, handler } from "@/lib/errors";
import { savedSearchSchema } from "@/lib/validation";

const MAX_SEARCHES = 20;

export const GET = handler("saved_searches_list", async () => {
  const user = await requireUserApi();
  return NextResponse.json(await db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }));
});

export const POST = handler("saved_searches_create", async (request: Request) => {
  const user = await requireUserApi();
  const data = savedSearchSchema.parse(await request.json());
  if ((await db.savedSearch.count({ where: { userId: user.id } })) >= MAX_SEARCHES) {
    throw new AppError(`You can keep up to ${MAX_SEARCHES} saved searches. Delete one to add another.`, 400, "limit");
  }
  const created = await db.savedSearch.create({ data: { userId: user.id, ...data } });
  return NextResponse.json(created, { status: 201 });
});
