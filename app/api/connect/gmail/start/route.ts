import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto/envelope";
import { env } from "@/lib/env";
import { handler } from "@/lib/errors";
import { getMailbox } from "@/lib/providers/mailbox";

export const runtime = "nodejs";

const COOKIE = "pl_mailbox_oauth";

/**
 * Begin connecting the candidate's own Gmail. A random `state` (CSRF) and a PKCE verifier are kept in a short-lived,
 * httpOnly cookie that is encrypted and bound to the signed-in user, then the browser goes to Google's consent screen.
 */
export const GET = handler("mailbox_connect_start", async () => {
  const user = await requireUserApi();
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const redirectUri = `${env.appUrl}/api/connect/gmail/callback`;
  const url = getMailbox().authUrl({ state, codeChallenge: createHash("sha256").update(verifier).digest("base64url"), redirectUri, loginHint: user.email });

  const res = NextResponse.redirect(url, 303);
  res.cookies.set(COOKIE, encryptSecret(JSON.stringify({ state, verifier, userId: user.id, exp: Date.now() + 10 * 60_000 }), "mailbox-oauth"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connect/gmail", maxAge: 600,
  });
  return res;
});
