import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";

/** The signed-in user's resumes (metadata only). */
export const GET = handler("resume_list", async () => {
  const user = await requireUserApi();
  const resumes = await db.resume.findMany({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    select: { id: true, fileName: true, isPrimary: true, createdAt: true },
  });
  return NextResponse.json(resumes);
});
