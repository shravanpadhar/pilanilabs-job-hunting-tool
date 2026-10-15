import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/** Cron endpoints accept only `Authorization: Bearer <CRON_SECRET>` (Vercel Cron adds this automatically). */
export function assertCron(request: Request): void {
  const secret = env.cronSecret;
  if (!secret) throw new AppError("CRON_SECRET is not configured.", 503, "cron_not_configured");
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError("Unauthorized.", 401, "unauthorized");
}
