import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { handler } from "@/lib/errors";
import { intakeFromPaste, intakeFromUrl, pasteSchema } from "@/lib/outreach/intake";
import { assertAiQuota } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.union([z.object({ url: z.string().trim().min(8).max(2000) }), z.object({ pasted: pasteSchema })]);

/**
 * Step 1 of outreach: read a job from a link (or pasted text). Nothing is stored here; the candidate reviews the
 * extracted job and creates the campaign in a second call. Page text is untrusted data throughout.
 */
export const POST = handler("outreach_intake", async (request: Request) => {
  const user = await requireUserApi();
  const body = bodySchema.parse(await request.json());
  await assertAiQuota(user.id, "extract_job");
  const result = "url" in body ? await intakeFromUrl(user.id, body.url) : await intakeFromPaste(user.id, body.pasted);
  return NextResponse.json(result);
});
