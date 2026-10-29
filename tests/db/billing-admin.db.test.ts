import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { overview, sendHealth, suppression, auditLog, abuseReview, usd } from "@/lib/admin/queries";
import { isAdminEmail } from "@/lib/admin/guard";
import { balance, chargeForReply, ensureTrialCredits, grantCredits, post, refundTarget, spendForTargets } from "@/lib/billing/credits";
import { assertWithinCostCeiling, recordProviderUsage } from "@/lib/billing/cost";
import { addSuppression, hashEmail } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { activateCampaign } from "@/lib/outreach/activate";
import { approveMessage } from "@/lib/outreach/approval";
import { createCampaignFromExtracted } from "@/lib/outreach/campaigns";
import { generateDraftsForCampaign } from "@/lib/outreach/draft";
import { insightsFor } from "@/lib/outreach/insights";
import { saveOutreachProfile } from "@/lib/outreach/profile";
import { acknowledgeRisk, discoverTargets } from "@/lib/outreach/targets";
import { toTargetViews } from "@/lib/outreach/view";
import { saveConnectedAccount } from "@/lib/providers/mailbox/accounts";
import { getLimits, getPricing, setSetting } from "@/lib/settings";
import { resumeSchema } from "@/lib/resume/schema";

process.env.AI_PROVIDER = "fake";

const tag = `ba${Date.now()}`;
const mk = () => randomUUID();
const users: string[] = [];
async function user(label: string) {
  const id = mk();
  users.push(id);
  await db.user.create({ data: { id, email: `${label}.${tag}@example.com` } });
  return id;
}

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.companyProfile.deleteMany({ where: { slug: { startsWith: "co" } } });
  await db.suppressionEntry.deleteMany({});
  await db.appSetting.deleteMany({ where: { key: { in: ["pricing", "limits"] } } });
  await db.$disconnect();
});

beforeAll(async () => {
  await db.appSetting.deleteMany({ where: { key: { in: ["pricing", "limits"] } } });
});

describe("settings are configuration, not code", () => {
  it("falls back to the defaults, validates writes, and ignores a corrupted stored value", async () => {
    const d = await getPricing();
    expect(d.trialCredits).toBeGreaterThanOrEqual(0);
    expect(d.packs.length).toBeGreaterThan(0);
    const admin = await user("cfg");
    await setSetting("pricing", { ...d, trialCredits: 7, creditsPerTarget: 2, payOnReply: { enabled: true, credits: 3 } }, admin);
    const changed = await getPricing();
    expect(changed).toMatchObject({ trialCredits: 7, creditsPerTarget: 2, payOnReply: { enabled: true, credits: 3 } });
    await expect(setSetting("pricing", { trialCredits: -5 }, admin)).rejects.toThrow();
    await expect(setSetting("limits", { costCeilingMicros: "lots" }, admin)).rejects.toThrow();
    await db.appSetting.update({ where: { key: "pricing" }, data: { value: { trialCredits: "garbage" } } });
    expect((await getPricing()).trialCredits).toBe(d.trialCredits); // safe default, not a crash
    expect(await db.auditEvent.count({ where: { userId: admin, action: "setting.changed" } })).toBe(1);
    await db.appSetting.delete({ where: { key: "pricing" } });
  });
});

describe("credit ledger", () => {
  it("grants the trial once, however often it is asked", async () => {
    const u = await user("trial");
    await Promise.all([ensureTrialCredits(u), ensureTrialCredits(u), ensureTrialCredits(u)]);
    await ensureTrialCredits(u);
    expect(await balance(u)).toBe((await getPricing()).trialCredits);
  });

  it("charges per person, idempotently, and never goes negative", async () => {
    const u = await user("spend");
    await grantCredits(u, 5, "ADJUSTMENT", "t", "a");
    expect(await spendForTargets(u, ["t1", "t2"])).toEqual({ charged: 2, cost: 2 });
    expect(await balance(u)).toBe(3);
    expect(await spendForTargets(u, ["t1", "t2"])).toEqual({ charged: 0, cost: 0 }); // same event, no second charge
    expect(await balance(u)).toBe(3);
    await expect(spendForTargets(u, ["t3", "t4", "t5", "t6"])).rejects.toMatchObject({ code: "insufficient_credits" });
    expect(await balance(u)).toBe(3); // all or nothing
    expect(await db.creditLedger.count({ where: { userId: u, refId: { in: ["t3", "t4", "t5", "t6"] } } })).toBe(0);
  });

  it("two simultaneous activations cannot spend the same credits twice", async () => {
    const u = await user("race");
    await grantCredits(u, 3, "ADJUSTMENT", "t", "a");
    const results = await Promise.allSettled([spendForTargets(u, ["a1", "a2", "a3"]), spendForTargets(u, ["b1", "b2", "b3"]), spendForTargets(u, ["c1", "c2", "c3"])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(u)).toBe(0);
    expect(await db.creditLedger.count({ where: { userId: u, reason: "SPEND_TARGET" } })).toBe(3);
  });

  it("a refund returns exactly what was charged, once", async () => {
    const u = await user("refund");
    await grantCredits(u, 4, "ADJUSTMENT", "t", "a");
    await spendForTargets(u, ["r1"]);
    expect(await refundTarget(u, "r1")).toBe(true);
    expect(await refundTarget(u, "r1")).toBe(false);
    expect(await refundTarget(u, "never-charged")).toBe(false);
    expect(await balance(u)).toBe(4);
  });

  it("pay-on-reply is off by default and charges once per reply when switched on", async () => {
    const u = await user("reply");
    await grantCredits(u, 10, "ADJUSTMENT", "t", "a");
    expect(await chargeForReply(u, "reply-1")).toBe(false);
    await setSetting("pricing", { ...(await getPricing()), payOnReply: { enabled: true, credits: 2 } }, u);
    expect(await chargeForReply(u, "reply-1")).toBe(true);
    expect(await chargeForReply(u, "reply-1")).toBe(false);
    expect(await balance(u)).toBe(8);
    await db.appSetting.delete({ where: { key: "pricing" } });
  });

  it("post() is the single idempotent gate", async () => {
    const u = await user("post");
    const p = { userId: u, delta: 3, reason: "PURCHASE" as const, refType: "x", refId: "1" };
    expect(await post(p)).toBe(true);
    expect(await post(p)).toBe(false);
    expect(await balance(u)).toBe(3);
  });
});

describe("cost ceiling", () => {
  it("blocks paid calls once AI + provider spend reaches the ceiling, and a per-candidate override wins", async () => {
    const u = await user("ceiling");
    await assertWithinCostCeiling(u);
    await recordProviderUsage(u, "fake", "search", 400_000);
    await db.aiUsage.create({ data: { userId: u, feature: "draft_outreach", model: "m", inputTokens: 1, outputTokens: 1, costMicros: 700_000 } });
    await setSetting("limits", { costCeilingMicros: 1_000_000 }, u);
    await expect(assertWithinCostCeiling(u)).rejects.toMatchObject({ code: "cost_ceiling", status: 402 });
    await db.outreachProfile.upsert({ where: { userId: u }, create: { userId: u, costCeilingMicros: 5_000_000 }, update: { costCeilingMicros: 5_000_000 } });
    await assertWithinCostCeiling(u);
    expect((await getLimits()).costCeilingMicros).toBe(1_000_000);
    await db.appSetting.delete({ where: { key: "limits" } });
  });
});

describe("activation charges credits", () => {
  it("refuses to start (and schedules nothing) when the candidate cannot afford their people; succeeds once funded", async () => {
    const u = await user("act");
    await db.resume.create({ data: { userId: u, fileName: "r.pdf", rawText: "x", isPrimary: true, parsedJson: resumeSchema.parse({ contact: { name: "Asha Verma", email: `act.${tag}@example.com` }, skills: { technical: ["React"] }, experience: [{ company: "Initech", title: "Frontend Engineer", bullets: [] }], education: [{ institution: "BITS Pilani" }] }) as object } });
    await saveOutreachProfile(u, { senderName: "Asha Verma", postalAddress: "12 MG Road, Bengaluru 560001, India", timeZone: "Asia/Kolkata" });
    await saveConnectedAccount({ userId: u, provider: "GMAIL", accountEmail: `act.${tag}@gmail.test`, refreshToken: "t", scopes: [] });
    await db.creditLedger.deleteMany({ where: { userId: u } }); // start from zero
    // With the free trial switched off, a candidate with no credits cannot start.
    await setSetting("pricing", { ...(await getPricing()), trialCredits: 0 }, u);

    const { campaign } = await createCampaignFromExtracted(u, { title: "Engineer", company: `Co${tag}`, location: "Pune, India", description: "Build React apps.\n- 3+ years", requirements: [], sourceUrl: null, applyUrl: null, source: "pasted" });
    await discoverTargets({ userId: u, campaignId: campaign.id, limit: 2 });
    for (const v of await toTargetViews(await db.outreachTarget.findMany({ where: { campaignId: campaign.id } }))) if (v.needsDecision.length && !v.hardBlocks.length) await acknowledgeRisk(u, v.id);
    await generateDraftsForCampaign(u, campaign.id);
    for (const m of await db.outreachMessage.findMany({ where: { target: { campaignId: campaign.id }, channel: "EMAIL" } })) await approveMessage(u, m.id);

    await expect(activateCampaign(u, campaign.id)).rejects.toMatchObject({ code: "insufficient_credits" });
    expect((await db.outreachCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("DRAFT");
    expect(await db.outreachMessage.count({ where: { target: { campaignId: campaign.id }, state: "SCHEDULED" } })).toBe(0);

    await db.appSetting.delete({ where: { key: "pricing" } });
    await grantCredits(u, 10, "ADJUSTMENT", "t", "fund");
    const res = await activateCampaign(u, campaign.id);
    expect(res.targets).toBeGreaterThan(0);
    expect(await balance(u)).toBe((await getPricing()).trialCredits + 10 - res.targets); // the default free trial is granted on first start
    expect(await db.creditLedger.count({ where: { userId: u, reason: "SPEND_TARGET" } })).toBe(res.targets);
  });
});

describe("admin", () => {
  it("only allow-listed emails are admins", async () => {
    process.env.ADMIN_EMAILS = " Boss@Example.com, ops@example.com ";
    try {
      expect(isAdminEmail("boss@example.com")).toBe(true);
      expect(isAdminEmail("OPS@example.com")).toBe(true);
      expect(isAdminEmail("candidate@example.com")).toBe(false);
      expect(isAdminEmail("")).toBe(false);
      expect(isAdminEmail(null)).toBe(false);
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
    expect(isAdminEmail("boss@example.com")).toBe(false); // nobody is admin by default
  });

  it("the overview, health, suppression, audit and abuse views reflect real data", async () => {
    const u = await user("adm");
    await recordProviderUsage(u, "fake", "search_people", 20_000);
    await addSuppression(`gone.${tag}@example.com`, "OPT_OUT");
    await audit({ userId: u, action: "message.sent", entityType: "OutreachMessage", entityId: "m-adm" });

    const o = await overview();
    expect(o.providers.find((p) => p.provider === "fake")!.costMicros).toBeGreaterThanOrEqual(20_000);
    expect(o.margin.providerCostMicros).toBeGreaterThanOrEqual(20_000);

    const s = await suppression(`Gone.${tag}@example.com`);
    expect(s.lookup).toMatchObject({ suppressed: true, reason: "OPT_OUT" });
    expect(s.recent.every((r) => r.hash.endsWith("…") && !r.hash.includes("@"))).toBe(true);
    expect((await suppression(`nobody.${tag}@example.com`)).lookup!.suppressed).toBe(false);
    expect(hashEmail(`gone.${tag}@example.com`)).toHaveLength(64);

    const log = await auditLog({ action: "message.sent", userId: u });
    expect(log.rows.some((r) => r.entityId === "m-adm")).toBe(true);
    expect((await auditLog({ action: "no.such.action" })).total).toBe(0);

    expect(Array.isArray(await sendHealth())).toBe(true);
    expect(Array.isArray(await abuseReview())).toBe(true);
    expect(usd(1_500_000)).toBe("$1.50");
  });

  it("flags a candidate who was automatically paused", async () => {
    const u = await user("abuse");
    const c = await db.outreachCampaign.create({ data: { userId: u, companyKey: "x", jobSnapshot: {}, status: "ACTIVE" } });
    await db.outreachProfile.create({ data: { userId: u, sendingPausedAt: new Date(), pauseReason: "2 spam complaints", pausedBy: "SYSTEM" } });
    const flagged = await abuseReview();
    const mine = flagged.find((f) => f.userId === u)!;
    expect(mine.paused).toBe(true);
    expect(mine.reasons.join(" ")).toMatch(/paused/);
    await db.outreachCampaign.delete({ where: { id: c.id } });
  });
});

describe("insights", () => {
  it("counts people contacted, real replies, referrals and interviews per template and company type", async () => {
    const u = await user("ins");
    const job = await db.job.create({ data: { source: "user-link", externalId: `ins-${tag}`, title: "T", company: "C", companySlug: "c", descriptionText: "d", postedAt: new Date(), applyUrl: "https://x.example", dedupeHash: `ins-${tag}`, ownerUserId: u } });
    const campaign = await db.outreachCampaign.create({ data: { userId: u, jobId: job.id, companyKey: "c", companyType: "startup", jobSnapshot: {}, status: "ACTIVE" } });
    const person = async (n: string, templateKey: string, replies: Array<"INTERESTED" | "REFERRAL" | "NO" | "OUT_OF_OFFICE" | "UNSUBSCRIBE">) => {
      const t = await db.outreachTarget.create({ data: { campaignId: campaign.id, fullName: n, roleType: "RECRUITER", dataProvider: "fake", state: "SENT" } });
      const m = await db.outreachMessage.create({ data: { targetId: t.id, channel: "EMAIL", step: 1, body: "b", state: "SENT", sentAt: new Date(), templateKey } });
      for (const [i, c] of replies.entries()) await db.reply.create({ data: { messageId: m.id, providerMessageId: `ins-${tag}-${n}-${i}`, receivedAt: new Date(), snippet: "s", classification: c } });
    };
    await person("A", "email.v1.s1", ["INTERESTED"]);
    await person("B", "email.v1.s1", ["REFERRAL"]);
    await person("C", "email.v1.s1", []);
    await person("D", "email.fallback.v1.s1", ["NO"]);
    await person("E", "email.fallback.v1.s1", ["OUT_OF_OFFICE"]); // not a real reply
    await person("F", "email.fallback.v1.s1", ["UNSUBSCRIBE"]); // not a real reply
    await db.application.create({ data: { userId: u, jobId: job.id, status: "INTERVIEWING" } });

    const i = await insightsFor(u);
    expect(i.total).toMatchObject({ contacted: 6, replied: 3, referrals: 1, interviews: 2 });
    expect(i.total.replyRate).toBeCloseTo(0.5);
    const v1 = i.byTemplate.find((b) => b.key === "email.v1")!;
    expect(v1).toMatchObject({ contacted: 3, replied: 2, referrals: 1, interviews: 2 });
    expect(v1.replyRate).toBeCloseTo(2 / 3);
    const fb = i.byTemplate.find((b) => b.key === "email.fallback.v1")!;
    expect(fb).toMatchObject({ contacted: 3, replied: 1, referrals: 0, interviews: 0 });
    expect(i.byCompanyType).toEqual([expect.objectContaining({ key: "startup", contacted: 6 })]);
    expect((await insightsFor(await user("empty"))).total.contacted).toBe(0);
    await db.application.deleteMany({ where: { userId: u } });
  });
});
