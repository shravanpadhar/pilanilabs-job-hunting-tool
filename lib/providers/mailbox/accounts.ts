import type { ConnectedAccount, ConnectedProvider } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret, needsRewrap, rewrap } from "@/lib/crypto/envelope";
import { db } from "@/lib/db";

/**
 * Connected mailbox accounts. The refresh token is envelope-encrypted before it touches the database and is
 * only decrypted inside `getRefreshToken`, which the mailbox adapter calls at the moment it needs an access
 * token. Everything else works with `SafeAccount`, a projection that has no token field at all.
 */
export type SafeAccount = Omit<ConnectedAccount, "encryptedRefreshToken">;

const safeSelect = {
  id: true, userId: true, provider: true, accountEmail: true, scopes: true, status: true, dailySendCap: true,
  warmupStage: true, syncCursor: true, lastSyncAt: true, lastError: true, connectedAt: true,
} as const;

/** The AAD context binds the ciphertext to its record, so a token copied to another row will not decrypt. */
const contextFor = (userId: string, provider: ConnectedProvider, accountEmail: string) => `acct:${userId}:${provider}:${accountEmail.toLowerCase()}`;

export async function saveConnectedAccount(input: {
  userId: string;
  provider: ConnectedProvider;
  accountEmail: string;
  refreshToken: string;
  scopes: string[];
}): Promise<SafeAccount> {
  const accountEmail = input.accountEmail.trim().toLowerCase();
  const encryptedRefreshToken = encryptSecret(input.refreshToken, contextFor(input.userId, input.provider, accountEmail));
  const row = await db.connectedAccount.upsert({
    where: { userId_provider_accountEmail: { userId: input.userId, provider: input.provider, accountEmail } },
    create: { userId: input.userId, provider: input.provider, accountEmail, encryptedRefreshToken, scopes: input.scopes },
    // Reconnecting re-activates the account and replaces the token, but keeps cap and warm-up progress.
    update: { encryptedRefreshToken, scopes: input.scopes, status: "ACTIVE", lastError: null },
    select: safeSelect,
  });
  await audit({ userId: input.userId, action: "mailbox.connected", entityType: "ConnectedAccount", entityId: row.id, detail: { provider: input.provider, scopes: input.scopes } });
  return row;
}

export async function listConnectedAccounts(userId: string): Promise<SafeAccount[]> {
  return db.connectedAccount.findMany({ where: { userId }, select: safeSelect, orderBy: { connectedAt: "asc" } });
}

/** Server-side only. Decrypts the refresh token; lazily re-wraps it under the current key after a rotation. */
export async function getRefreshToken(accountId: string): Promise<string> {
  const row = await db.connectedAccount.findUnique({ where: { id: accountId }, select: { userId: true, provider: true, accountEmail: true, encryptedRefreshToken: true } });
  if (!row) throw new Error("Connected account not found.");
  const ctx = contextFor(row.userId, row.provider, row.accountEmail);
  const token = decryptSecret(row.encryptedRefreshToken, ctx);
  if (needsRewrap(row.encryptedRefreshToken)) {
    await db.connectedAccount.update({ where: { id: accountId }, data: { encryptedRefreshToken: rewrap(row.encryptedRefreshToken, ctx) } });
  }
  return token;
}

/**
 * Disconnect: the caller must first revoke the token with the provider (Phase 4 adapter). This wipes it locally
 * and marks the account REVOKED, so nothing can ever use it again. The row is kept for the audit trail.
 */
export async function markRevoked(accountId: string, userId: string): Promise<void> {
  const res = await db.connectedAccount.updateMany({
    where: { id: accountId, userId },
    data: { status: "REVOKED", encryptedRefreshToken: encryptSecret("revoked", `revoked:${accountId}`) },
  });
  if (res.count > 0) await audit({ userId, action: "mailbox.disconnected", entityType: "ConnectedAccount", entityId: accountId });
}
