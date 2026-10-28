import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto/envelope";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { saveConnectedAccount } from "@/lib/providers/mailbox/accounts";
import { getMailbox } from "@/lib/providers/mailbox";

export const runtime = "nodejs";

const COOKIE = "pl_mailbox_oauth";

const back = (params: Record<string, string>) => {
  const res = NextResponse.redirect(`${env.appUrl}/outreach?${new URLSearchParams(params)}`, 303);
  res.cookies.delete({ name: COOKIE, path: "/api/connect/gmail" });
  return res;
};

/** Google sends the browser back here with a one-time code. We check the state, exchange the code, and store the token encrypted. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const url = new URL(request.url);
    if (url.searchParams.get("error")) return back({ mailbox: "denied" });

    const cookie = request.cookies.get(COOKIE)?.value;
    if (!cookie) return back({ mailbox: "expired" });
    const saved = JSON.parse(decryptSecret(cookie, "mailbox-oauth")) as { state: string; verifier: string; userId: string; exp: number };
    // The state must match, the cookie must belong to THIS signed-in user, and it must still be fresh.
    if (saved.state !== url.searchParams.get("state") || saved.userId !== user.id || saved.exp < Date.now()) return back({ mailbox: "invalid" });

    const code = url.searchParams.get("code");
    if (!code) return back({ mailbox: "invalid" });
    const mailbox = getMailbox();
    const result = await mailbox.exchangeCode({ code, codeVerifier: saved.verifier, redirectUri: `${env.appUrl}/api/connect/gmail/callback` });
    await saveConnectedAccount({ userId: user.id, provider: "GMAIL", accountEmail: result.accountEmail, refreshToken: result.refreshToken, scopes: result.scopes });
    return back({ mailbox: "connected" });
  } catch (err) {
    log.error("mailbox_connect_failed", err);
    const code = (err as { code?: string }).code;
    return back({ mailbox: code === "scope_missing" ? "scope_missing" : "error" });
  }
}
