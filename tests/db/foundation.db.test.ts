import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "@/lib/audit";
import { addDomainSuppression, addSuppression, hashEmail, isSuppressed, suppressedSet } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";
import { getRefreshToken, listConnectedAccounts, markRevoked, saveConnectedAccount } from "@/lib/providers/mailbox/accounts";

const userId = randomUUID();
const tag = `t${Date.now()}`;
const email = (n: string) => `${n}.${tag}@example.com`;

beforeAll(async () => {
  await db.user.create({ data: { id: userId, email: `user.${tag}@example.com` } });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.suppressionEntry.deleteMany({ where: { emailHash: { in: [hashEmail(email("a")), hashEmail(email("b"))] } } });
  await db.$disconnect();
});

describe("suppression list (database)", () => {
  it("suppresses by hashed address, idempotently, and never stores the address", async () => {
    const a = email("a");
    expect(await isSuppressed(a)).toBe(false);
    const h1 = await addSuppression(a, "OPT_OUT");
    const h2 = await addSuppression(a.toUpperCase(), "BOUNCE"); // same person, different case: first reason is kept
    expect(h1).toBe(h2);
    expect(await isSuppressed(a)).toBe(true);
    expect(await isSuppressed(`  ${a.toUpperCase()}  `)).toBe(true);
    const row = await db.suppressionEntry.findUnique({ where: { emailHash: h1 } });
    expect(row?.reason).toBe("OPT_OUT");
    expect(JSON.stringify(row)).not.toContain(tag);
  });

  it("checks many addresses in one pass and honours domain-level entries", async () => {
    const domain = `blocked-${tag}.example`;
    await addDomainSuppression(domain);
    const set = await suppressedSet([email("a"), email("b"), `someone@${domain}`]);
    expect(set.has(email("a"))).toBe(true);
    expect(set.has(email("b"))).toBe(false);
    expect(set.has(`someone@${domain}`)).toBe(true);
    await db.suppressionEntry.deleteMany({ where: { reason: "MANUAL", emailHash: (await import("@/lib/compliance/suppression")).hashDomain(domain) } });
  });

  it("survives account deletion (no relation to User)", async () => {
    const throwaway = randomUUID();
    await db.user.create({ data: { id: throwaway, email: `gone.${tag}@example.com` } });
    const b = email("b");
    await addSuppression(b, "OPT_OUT");
    await audit({ userId: throwaway, action: "account.deleted", entityType: "User", entityId: throwaway });
    await db.user.delete({ where: { id: throwaway } });
    expect(await isSuppressed(b)).toBe(true);
    expect(await db.auditEvent.count({ where: { userId: throwaway } })).toBe(1);
    await db.auditEvent.deleteMany({ where: { userId: throwaway } });
  });
});

describe("audit log (database)", () => {
  it("stores events with scrubbed detail", async () => {
    await audit({ userId, action: "message.approved", entityType: "OutreachMessage", entityId: "m1", detail: { to: "private@example.com", step: 1 } });
    const row = await db.auditEvent.findFirst({ where: { userId, action: "message.approved" } });
    expect(row).toBeTruthy();
    expect(JSON.stringify(row!.detail)).not.toContain("private@example.com");
    expect((row!.detail as Record<string, unknown>).step).toBe(1);
    await db.auditEvent.deleteMany({ where: { userId } });
  });
});

describe("connected mailbox accounts (database)", () => {
  it("stores the refresh token encrypted and exposes a projection without it", async () => {
    const saved = await saveConnectedAccount({ userId, provider: "GMAIL", accountEmail: "Me@Example.com", refreshToken: "1//the-refresh-token", scopes: ["gmail.send"] });
    expect(saved.accountEmail).toBe("me@example.com");
    expect("encryptedRefreshToken" in saved).toBe(false);
    expect((await listConnectedAccounts(userId))[0]).not.toHaveProperty("encryptedRefreshToken");

    const raw = await db.connectedAccount.findUnique({ where: { id: saved.id } });
    expect(raw!.encryptedRefreshToken).not.toContain("the-refresh-token");
    expect(await getRefreshToken(saved.id)).toBe("1//the-refresh-token");
  });

  it("reconnecting replaces the token but keeps the daily cap and warm-up progress", async () => {
    const acct = (await listConnectedAccounts(userId))[0];
    await db.connectedAccount.update({ where: { id: acct.id }, data: { dailySendCap: 15, warmupStage: 2, status: "ERROR" } });
    const again = await saveConnectedAccount({ userId, provider: "GMAIL", accountEmail: "me@example.com", refreshToken: "1//new-token", scopes: ["gmail.send", "gmail.readonly"] });
    expect(again.id).toBe(acct.id);
    expect(again.status).toBe("ACTIVE");
    expect(again.dailySendCap).toBe(15);
    expect(again.warmupStage).toBe(2);
    expect(await getRefreshToken(again.id)).toBe("1//new-token");
  });

  it("a ciphertext copied onto another account cannot be decrypted", async () => {
    const a = (await listConnectedAccounts(userId))[0];
    const other = await saveConnectedAccount({ userId, provider: "GMAIL", accountEmail: "other@example.com", refreshToken: "1//other", scopes: [] });
    const stolen = (await db.connectedAccount.findUnique({ where: { id: a.id } }))!.encryptedRefreshToken;
    await db.connectedAccount.update({ where: { id: other.id }, data: { encryptedRefreshToken: stolen } });
    await expect(getRefreshToken(other.id)).rejects.toThrow();
  });

  it("disconnecting wipes the token and marks the account revoked", async () => {
    const a = (await listConnectedAccounts(userId))[0];
    await markRevoked(a.id, userId);
    const row = await db.connectedAccount.findUnique({ where: { id: a.id } });
    expect(row!.status).toBe("REVOKED");
    await expect(getRefreshToken(a.id)).rejects.toThrow(); // context no longer matches the real token
    expect(await db.auditEvent.count({ where: { userId, action: "mailbox.disconnected" } })).toBe(1);
  });

  it("deleting the user cascades to mailbox accounts", async () => {
    const throwaway = randomUUID();
    await db.user.create({ data: { id: throwaway, email: `cascade.${tag}@example.com` } });
    await saveConnectedAccount({ userId: throwaway, provider: "GMAIL", accountEmail: "x@example.com", refreshToken: "t", scopes: [] });
    await db.user.delete({ where: { id: throwaway } });
    expect(await db.connectedAccount.count({ where: { userId: throwaway } })).toBe(0);
    await db.auditEvent.deleteMany({ where: { userId: throwaway } });
  });
});

describe("schema constraints", () => {
  it("a step can only exist once per target and channel, and a send key is globally unique", async () => {
    const campaign = await db.outreachCampaign.create({ data: { userId, companyKey: "acme", jobSnapshot: {} } });
    const target = await db.outreachTarget.create({ data: { campaignId: campaign.id, fullName: "Pat", roleType: "RECRUITER", dataProvider: "fake" } });
    const base = { targetId: target.id, channel: "EMAIL" as const, step: 1, body: "hi" };
    await db.outreachMessage.create({ data: { ...base, sendKey: `k-${tag}` } });
    await expect(db.outreachMessage.create({ data: base })).rejects.toThrow(); // same (target, channel, step)
    await expect(db.outreachMessage.create({ data: { ...base, step: 2, sendKey: `k-${tag}` } })).rejects.toThrow(); // same sendKey
    await db.outreachCampaign.delete({ where: { id: campaign.id } }); // cascades to targets and messages
    expect(await db.outreachMessage.count({ where: { targetId: target.id } })).toBe(0);
  });

  it("credit ledger postings are idempotent per event", async () => {
    const row = { userId, delta: -1, reason: "SPEND_TARGET" as const, refType: "target", refId: `t-${tag}` };
    await db.creditLedger.create({ data: row });
    await expect(db.creditLedger.create({ data: row })).rejects.toThrow();
    await db.creditLedger.deleteMany({ where: { userId } });
  });

  it("private jobs belong to a user and disappear with them; shared jobs have no owner", async () => {
    const owner = randomUUID();
    await db.user.create({ data: { id: owner, email: `owner.${tag}@example.com` } });
    const mk = (suffix: string, ownerUserId: string | null) =>
      db.job.create({
        data: { source: "user-link", externalId: `${tag}-${suffix}`, title: "T", company: "C", companySlug: "c", descriptionText: "d", postedAt: new Date(), applyUrl: "https://x.example/j", dedupeHash: `${tag}-${suffix}`, isDirect: false, ownerUserId },
      });
    const priv = await mk("p", owner);
    const shared = await mk("s", null);
    expect((await db.job.findMany({ where: { ownerUserId: null, id: { in: [priv.id, shared.id] } } })).map((j) => j.id)).toEqual([shared.id]);
    await db.user.delete({ where: { id: owner } });
    expect(await db.job.findUnique({ where: { id: priv.id } })).toBeNull();
    await db.job.delete({ where: { id: shared.id } });
  });
});
