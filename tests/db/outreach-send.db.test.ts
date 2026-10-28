import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { advanceClock, resetClock } from "@/lib/clock";
import { optOutToken } from "@/lib/compliance/optout";
import { isSuppressed } from "@/lib/compliance/suppression";
import { grantCredits } from "@/lib/billing/credits";
import { db } from "@/lib/db";
import { setCampaignStatus, activateCampaign } from "@/lib/outreach/activate";
import { approveMessage } from "@/lib/outreach/approval";
import { createCampaignFromExtracted } from "@/lib/outreach/campaigns";
import { generateDraftsForCampaign } from "@/lib/outreach/draft";
import { evaluateHealth, resumeSending } from "@/lib/outreach/health";
import { processOptOut } from "@/lib/outreach/optout-action";
import { saveOutreachProfile } from "@/lib/outreach/profile";
import { dispatchDueMessages, recoverStaleClaims, sendMessage } from "@/lib/outreach/send";
import { acknowledgeRisk, discoverTargets } from "@/lib/outreach/targets";
import { toTargetViews } from "@/lib/outreach/view";
import { fakeMailbox, FakeMailbox } from "@/lib/providers/mailbox/fake";
import { saveConnectedAccount } from "@/lib/providers/mailbox/accounts";
import { InlineQueue, QUEUE_FUNCTIONS } from "@/lib/providers/queue";
import { setQueueForTests } from "@/lib/providers/queue";
import { zonedToUtc } from "@/lib/outreach/schedule";
import { resumeSchema } from "@/lib/resume/schema";
import { sha256Hex } from "@/lib/outreach/approval";

process.env.AI_PROVIDER = "fake";

const tag = `os${Date.now()}`;
const userId = randomUUID();
const mailbox = new FakeMailbox();
let accountId = "";
let counter = 0;

const jobFor = (label: string) => ({ title: "Senior Frontend Engineer", company: `Co${label}${tag}`, location: "Bengaluru, India", description: "Build React apps.\n- 4+ years of React", requirements: ["4+ years of React"], sourceUrl: `https://careers.co${label}${tag}.com/j/1`, applyUrl: null, source: "link" });

/** A campaign with N approved, scheduled targets (all three emails each). */
async function scheduled(targets = 1) {
  const label = `${++counter}`;
  const { campaign } = await createCampaignFromExtracted(userId, jobFor(label));
  await discoverTargets({ userId, campaignId: campaign.id, limit: targets });
  for (const v of await toTargetViews(await db.outreachTarget.findMany({ where: { campaignId: campaign.id } }))) if (v.needsDecision.length && !v.hardBlocks.length) await acknowledgeRisk(userId, v.id);
  await generateDraftsForCampaign(userId, campaign.id);
  const msgs = await db.outreachMessage.findMany({ where: { target: { campaignId: campaign.id }, channel: "EMAIL" } });
  for (const m of msgs) await approveMessage(userId, m.id);
  await activateCampaign(userId, campaign.id);
  const all = await db.outreachMessage.findMany({ where: { target: { campaignId: campaign.id }, channel: "EMAIL" }, include: { target: true }, orderBy: [{ targetId: "asc" }, { step: "asc" }] });
  const byTarget = (i: number) => {
    const ids = [...new Set(all.map((m) => m.targetId))];
    return all.filter((m) => m.targetId === ids[i]).sort((a, b) => a.step - b.step);
  };
  return { campaign, all, byTarget };
}
const at = (m: { scheduledAt: Date | null }) => new Date(m.scheduledAt!.getTime() + 60_000);
const fresh = (id: string) => db.outreachMessage.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  await db.user.create({ data: { id: userId, email: `a.${tag}@example.com` } });
  const parsed = resumeSchema.parse({
    contact: { name: "Asha Verma", email: `a.${tag}@example.com` },
    skills: { technical: ["React", "TypeScript"] },
    experience: [{ company: "Initech", title: "Frontend Engineer", bullets: ["Built dashboards"] }],
    education: [{ institution: "BITS Pilani", degree: "B.E." }],
  });
  await db.resume.create({ data: { userId, fileName: "r.pdf", rawText: "Asha Verma", parsedJson: parsed as object, isPrimary: true } });
  await saveOutreachProfile(userId, { senderName: "Asha Verma", postalAddress: "12 MG Road, Bengaluru 560001, India", timeZone: "Asia/Kolkata" });
  await grantCredits(userId, 1000, "ADJUSTMENT", "test", "seed"); // plenty of credits: these tests are about sending, not billing
  const acct = await saveConnectedAccount({ userId, provider: "GMAIL", accountEmail: `asha.${tag}@gmail.test`, refreshToken: "fake-refresh", scopes: ["gmail.send"] });
  accountId = acct.id;
  // An established mailbox (past warm-up) with a generous cap, so most tests are about the other rules.
  await db.connectedAccount.update({ where: { id: accountId }, data: { connectedAt: new Date(Date.now() - 40 * 86_400_000), dailySendCap: 30 } });
});

beforeEach(async () => {
  fakeMailbox.reset();
  await db.outreachProfile.update({ where: { userId }, data: { sendingPausedAt: null, pauseReason: null, pausedBy: null } });
  await db.connectedAccount.update({ where: { id: accountId }, data: { dailySendCap: 30, status: "ACTIVE" } });
  // Each test starts with an empty "today": earlier tests' sends must not eat this test's cap or spacing.
  await db.outreachMessage.updateMany({ where: { state: "SENT", target: { campaign: { userId } } }, data: { sentAt: new Date(Date.now() - 10 * 86_400_000) } });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.companyProfile.deleteMany({ where: { slug: { startsWith: "co" } } });
  await db.suppressionEntry.deleteMany({});
  setQueueForTests(null);
  await db.$disconnect();
});

describe("activation", () => {
  it("schedules every approved email inside working hours, activates the campaign and tracks the job", async () => {
    const { campaign, all } = await scheduled(2);
    const c = await db.outreachCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(c.status).toBe("ACTIVE");
    expect(all.length).toBe(6);
    for (const m of all) {
      expect(m.state).toBe("SCHEDULED");
      expect(m.scheduledAt).toBeTruthy();
    }
    const app = await db.application.findFirst({ where: { userId, jobId: campaign.jobId! } });
    expect(app).toBeTruthy();
    const t0 = all.filter((m) => m.targetId === all[0].targetId);
    expect(t0[1].scheduledAt!.getTime() - t0[0].scheduledAt!.getTime()).toBeGreaterThanOrEqual(3 * 86_400_000 - 60_000);
  });

  it("needs a connected mailbox and at least one approved first email", async () => {
    const label = `${++counter}`;
    const { campaign } = await createCampaignFromExtracted(userId, jobFor(label));
    await discoverTargets({ userId, campaignId: campaign.id, limit: 1 });
    await expect(activateCampaign(userId, campaign.id)).rejects.toMatchObject({ code: "nothing_approved" });
    await db.connectedAccount.update({ where: { id: accountId }, data: { status: "REVOKED" } });
    await expect(activateCampaign(userId, campaign.id)).rejects.toMatchObject({ code: "no_mailbox" });
  });
});

describe("sending exactly once", () => {
  it("sends the approved text with the footer, opt-out headers and the approved resume attached", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    const out = await sendMessage(step1.id, { now: at(step1), mailbox });
    expect(out.status).toBe("sent");
    expect(fakeMailbox.sent).toHaveLength(1);
    const mail = fakeMailbox.sent[0];
    expect(mail.to).toBe(step1.target.email);
    expect(mail.subject).toBe(step1.subject);
    expect(mail.text).toContain(step1.body);
    expect(mail.text).toContain("12 MG Road");
    expect(mail.text).toMatch(/unsubscribe/);
    expect(mail.headers["List-Unsubscribe"]).toMatch(/\/api\/optout\//);
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mail.headers["X-Pilani-Send-Key"]).toBe(step1.sendKey);
    expect(mail.attachments).toHaveLength(1);
    expect(sha256Hex(mail.attachments[0].bytes)).toBe(step1.attachmentSha256);
    expect(mail.attachments[0].bytes.subarray(0, 4).toString()).toBe("%PDF");
    const sent = await fresh(step1.id);
    expect(sent.state).toBe("SENT");
    expect(sent.providerMessageId).toBeTruthy();
    expect(sent.threadId).toBeTruthy();
    expect((await db.outreachTarget.findUniqueOrThrow({ where: { id: step1.targetId } })).state).toBe("SENT");
    expect(await db.auditEvent.count({ where: { userId, action: "message.sent", entityId: step1.id } })).toBe(1);
  });

  it("calling again, or 8 workers at once, still sends exactly one email", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    const results = await Promise.all(Array.from({ length: 8 }, () => sendMessage(step1.id, { now: at(step1), mailbox })));
    expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(fakeMailbox.sent).toHaveLength(1);
    expect((await sendMessage(step1.id, { now: at(step1), mailbox })).status).toBe("skipped");
    expect(fakeMailbox.sent).toHaveLength(1);
  });

  it("a crash right after the provider accepted the mail never produces a duplicate", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    fakeMailbox.failNext("crash_after_send");
    const first = await sendMessage(step1.id, { now: at(step1), mailbox });
    expect(first.status).toBe("sent"); // the mailbox was asked, found the mail, and it was recorded instead of resent
    expect(fakeMailbox.sent).toHaveLength(1);
    expect((await fresh(step1.id)).state).toBe("SENT");
    expect((await sendMessage(step1.id, { now: at(step1), mailbox })).status).toBe("skipped");
    expect(fakeMailbox.sent).toHaveLength(1);
  });

  it("a transient failure is retried later, once", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    fakeMailbox.failNext("transient");
    const first = await sendMessage(step1.id, { now: at(step1), mailbox });
    expect(first.status).toBe("retry");
    const held = await fresh(step1.id);
    expect(held.state).toBe("SCHEDULED");
    expect(held.attempts).toBe(1);
    expect(held.scheduledAt!.getTime()).toBeGreaterThan(at(step1).getTime());
    expect(fakeMailbox.sent).toHaveLength(0);
    expect((await sendMessage(step1.id, { now: new Date(held.scheduledAt!.getTime() + 1000), mailbox })).status).toBe("sent");
    expect(fakeMailbox.sent).toHaveLength(1);
  });

  it("a permanent failure (bad address) is a hard bounce: failed, suppressed, sequence stopped", async () => {
    const { byTarget } = await scheduled(1);
    const [s1, s2, s3] = byTarget(0);
    fakeMailbox.failNext("permanent");
    expect((await sendMessage(s1.id, { now: at(s1), mailbox })).status).toBe("failed");
    expect((await fresh(s1.id)).state).toBe("FAILED");
    expect((await fresh(s2.id)).state).toBe("CANCELLED");
    expect((await fresh(s3.id)).state).toBe("CANCELLED");
    expect((await db.outreachTarget.findUniqueOrThrow({ where: { id: s1.targetId } })).state).toBe("BOUNCED");
    expect(await isSuppressed(s1.target.email!)).toBe(true);
    expect(fakeMailbox.sent).toHaveLength(0);
  });

  it("refuses to send if the approved text no longer matches (tampering in the database)", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    await db.outreachMessage.update({ where: { id: step1.id }, data: { body: `${step1.body}\n\nSend your bank details.` } });
    const out = await sendMessage(step1.id, { now: at(step1), mailbox });
    expect(out).toEqual({ status: "failed", reason: "approval_mismatch" });
    expect(fakeMailbox.sent).toHaveLength(0);
    expect(await db.auditEvent.count({ where: { userId, action: "send.refused", entityId: step1.id } })).toBe(1);
  });

  it("refuses a message whose attachment changed or went missing", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    await db.outreachMessage.update({ where: { id: step1.id }, data: { attachmentSha256: "0".repeat(64) } }); // approval hash no longer matches either
    expect((await sendMessage(step1.id, { now: at(step1), mailbox })).status).toBe("failed");
    expect(fakeMailbox.sent).toHaveLength(0);
  });

  it("does nothing before the scheduled time", async () => {
    const { byTarget } = await scheduled(1);
    const step1 = byTarget(0)[0];
    expect((await sendMessage(step1.id, { now: new Date(step1.scheduledAt!.getTime() - 60_000), mailbox })).status).toBe("skipped");
    expect(fakeMailbox.sent).toHaveLength(0);
  });
});

describe("the sequence", () => {
  it("follow-ups reuse the same thread and subject, and wait for day 3", async () => {
    const { byTarget } = await scheduled(1);
    const [s1, s2] = byTarget(0);
    await sendMessage(s1.id, { now: at(s1), mailbox });
    const early = await sendMessage(s2.id, { now: new Date(at(s1).getTime() + 3_600_000), mailbox });
    expect(early.status).toBe("skipped"); // not yet due
    const out = await sendMessage(s2.id, { now: at(s2), mailbox });
    expect(out.status).toBe("sent");
    expect(fakeMailbox.sent).toHaveLength(2);
    expect(fakeMailbox.sent[1].threadId).toBe(fakeMailbox.sent[0].threadId);
    expect(fakeMailbox.sent[1].subject).toBe(fakeMailbox.sent[0].subject);
    expect(fakeMailbox.sent[1].inReplyTo).toBeTruthy();
  });

  it("a follow-up is held while the first email has not gone out", async () => {
    const { byTarget } = await scheduled(1);
    const [, s2] = byTarget(0);
    const out = await sendMessage(s2.id, { now: at(s2), mailbox });
    expect(out).toEqual({ status: "held", reason: "previous_step_pending" });
    expect(fakeMailbox.sent).toHaveLength(0);
    expect((await fresh(s2.id)).state).toBe("SCHEDULED");
  });

  it("any reply cancels every remaining step by rule", async () => {
    const { byTarget } = await scheduled(1);
    const [s1, s2, s3] = byTarget(0);
    await sendMessage(s1.id, { now: at(s1), mailbox });
    await db.reply.create({ data: { messageId: s1.id, providerMessageId: `r-${tag}-${counter}`, receivedAt: new Date(), snippet: "Thanks" } });
    expect((await sendMessage(s2.id, { now: at(s2), mailbox })).reason).toBe("replied");
    expect((await sendMessage(s3.id, { now: at(s3), mailbox })).reason).toBe("replied");
    expect(fakeMailbox.sent).toHaveLength(1);
    expect((await fresh(s2.id)).state).toBe("CANCELLED");
  });
});

describe("opt-out and suppression", () => {
  it("the opt-out link suppresses the address, cancels unsent mail and stops later sends", async () => {
    const { byTarget } = await scheduled(1);
    const [s1, s2, s3] = byTarget(0);
    await sendMessage(s1.id, { now: at(s1), mailbox });
    expect((await processOptOut("garbage.token")).ok).toBe(false);
    expect((await processOptOut(`${s1.targetId}.${"x".repeat(32)}`)).ok).toBe(false); // forged signature
    const res = await processOptOut(optOutToken(s1.targetId));
    expect(res.ok).toBe(true);
    expect(res.senderName).toBe("Asha Verma");
    expect(await isSuppressed(s1.target.email!)).toBe(true);
    expect((await db.outreachTarget.findUniqueOrThrow({ where: { id: s1.targetId } })).state).toBe("OPTED_OUT");
    expect((await fresh(s2.id)).state).toBe("CANCELLED");
    expect((await fresh(s3.id)).state).toBe("CANCELLED");
    expect((await processOptOut(optOutToken(s1.targetId))).ok).toBe(true); // idempotent
    expect((await sendMessage(s2.id, { now: at(s2), mailbox })).status).toBe("skipped");
    expect(fakeMailbox.sent).toHaveLength(1);
  });

  it("an address added to the suppression list AFTER scheduling is still never emailed", async () => {
    const { byTarget } = await scheduled(1);
    const s1 = byTarget(0)[0];
    const { addSuppression } = await import("@/lib/compliance/suppression");
    await addSuppression(s1.target.email!, "MANUAL");
    const out = await sendMessage(s1.id, { now: at(s1), mailbox });
    expect(out).toEqual({ status: "cancelled", reason: "suppressed" });
    expect(fakeMailbox.sent).toHaveLength(0);
  });
});

describe("limits and safety", () => {
  it("never sends outside the recipient's working hours: it reschedules instead", async () => {
    const { byTarget } = await scheduled(1);
    const s1 = byTarget(0)[0];
    const saturday = zonedToUtc(2026, 11, 7, 11, 0, "Asia/Kolkata");
    await db.outreachMessage.update({ where: { id: s1.id }, data: { scheduledAt: new Date(saturday.getTime() - 3_600_000) } });
    const out = await sendMessage(s1.id, { now: saturday, mailbox });
    expect(out).toEqual({ status: "held", reason: "outside_recipient_hours" });
    expect(fakeMailbox.sent).toHaveLength(0);
    expect((await fresh(s1.id)).scheduledAt!.getTime()).toBeGreaterThan(saturday.getTime());
  });

  it("enforces the daily cap across people, then resumes the next day", async () => {
    await db.connectedAccount.update({ where: { id: accountId }, data: { dailySendCap: 1 } });
    const { byTarget } = await scheduled(2);
    const a = byTarget(0)[0];
    const b = byTarget(1)[0];
    const now = new Date(Math.max(at(a).getTime(), at(b).getTime()) + 3_600_000);
    expect((await sendMessage(a.id, { now, mailbox })).status).toBe("sent");
    const second = await sendMessage(b.id, { now: new Date(now.getTime() + 3_600_000), mailbox });
    expect(second).toEqual({ status: "held", reason: "daily_cap" });
    expect(fakeMailbox.sent).toHaveLength(1);
    const next = await fresh(b.id);
    expect(next.scheduledAt!.getTime()).toBeGreaterThan(now.getTime() + 3_600_000);
  });

  it("a new mailbox is held to the warm-up allowance", async () => {
    await db.connectedAccount.update({ where: { id: accountId }, data: { connectedAt: new Date(), dailySendCap: 30 } });
    const { byTarget } = await scheduled(1);
    const s1 = byTarget(0)[0];
    for (let i = 0; i < 5; i++) {
      const filler = await db.outreachMessage.create({ data: { targetId: s1.targetId, channel: "LINKEDIN_MESSAGE", step: i + 1, body: "x", state: "DRAFT" } });
      void filler;
    }
    // Five already sent today from this (brand new) mailbox -> the sixth is held.
    const sixPack = await Promise.all(Array.from({ length: 5 }, (_, i) => db.outreachMessage.create({ data: { targetId: s1.targetId, channel: "EMAIL", step: 10 + i, body: "x", state: "SENT", sentAt: new Date(at(s1).getTime() - (i + 1) * 3_600_000 / 2) } })));
    void sixPack;
    expect((await sendMessage(s1.id, { now: at(s1), mailbox })).reason).toBe("daily_cap");
    expect(fakeMailbox.sent).toHaveLength(0);
  });

  it("keeps sends from one mailbox apart", async () => {
    const { byTarget } = await scheduled(2);
    const a = byTarget(0)[0];
    const b = byTarget(1)[0];
    const now = new Date(Math.max(at(a).getTime(), at(b).getTime()));
    expect((await sendMessage(a.id, { now, mailbox })).status).toBe("sent");
    const out = await sendMessage(b.id, { now: new Date(now.getTime() + 30_000), mailbox });
    expect(out).toEqual({ status: "held", reason: "spacing" });
  });

  it("a paused campaign, a paused candidate and the global kill switch all hold sending", async () => {
    const { campaign, byTarget } = await scheduled(1);
    const s1 = byTarget(0)[0];
    await setCampaignStatus(userId, campaign.id, "PAUSED");
    expect((await sendMessage(s1.id, { now: at(s1), mailbox })).reason).toBe("campaign_paused");
    await setCampaignStatus(userId, campaign.id, "ACTIVE");
    await db.outreachProfile.update({ where: { userId }, data: { sendingPausedAt: new Date(), pauseReason: "test", pausedBy: "USER" } });
    expect((await sendMessage(s1.id, { now: at(s1).getTime() ? new Date(at(s1).getTime() + 2 * 3_600_000) : at(s1), mailbox })).reason).toBe("sending_paused");
    await db.outreachProfile.update({ where: { userId }, data: { sendingPausedAt: null } });
    process.env.OUTREACH_SENDING_ENABLED = "false";
    try {
      expect((await sendMessage(s1.id, { now: new Date(at(s1).getTime() + 4 * 3_600_000), mailbox })).reason).toBe("sending_disabled");
    } finally {
      delete process.env.OUTREACH_SENDING_ENABLED;
    }
    expect(fakeMailbox.sent).toHaveLength(0);
  });

  it("cancelling a campaign cancels everything unsent", async () => {
    const { campaign, all } = await scheduled(1);
    await setCampaignStatus(userId, campaign.id, "CANCELLED");
    for (const m of await db.outreachMessage.findMany({ where: { id: { in: all.map((x) => x.id) } } })) expect(m.state).toBe("CANCELLED");
    expect((await sendMessage(all[0].id, { now: at(all[0]), mailbox })).status).toBe("skipped");
    expect(fakeMailbox.sent).toHaveLength(0);
  });
});

describe("auto-pause", () => {
  it("two spam complaints pause sending automatically, and only an admin can lift it", async () => {
    const { byTarget } = await scheduled(1);
    const s1 = byTarget(0)[0];
    await sendMessage(s1.id, { now: at(s1), mailbox });
    await db.reply.createMany({ data: [1, 2].map((n) => ({ messageId: s1.id, providerMessageId: `c-${tag}-${counter}-${n}`, receivedAt: new Date(), snippet: "this is spam", ruleHit: "complaint", classification: "UNSUBSCRIBE" as const })) });
    const res = await evaluateHealth(userId);
    expect(res.paused).toBe(true);
    const profile = await db.outreachProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile.sendingPausedAt).toBeTruthy();
    expect(profile.pausedBy).toBe("SYSTEM");
    expect(await resumeSending(userId, "USER")).toBe(false);
    expect(await resumeSending(userId, "ADMIN")).toBe(true);
    expect((await db.outreachProfile.findUniqueOrThrow({ where: { userId } })).sendingPausedAt).toBeNull();
    expect(await db.auditEvent.count({ where: { userId, action: "sending.auto_paused" } })).toBeGreaterThanOrEqual(1);
  });
});

describe("queue + recovery", () => {
  it("the tick dispatches due messages through the queue; a second tick sends nothing more", async () => {
    const q = new InlineQueue(QUEUE_FUNCTIONS);
    setQueueForTests(q);
    const { byTarget } = await scheduled(1);
    const s1 = byTarget(0)[0];
    // The queue handler reads "now" from the clock, so use the test clock (EXTERNAL_FAKES) to reach the scheduled time.
    // Other tests left scheduled mail behind; keep only this campaign due so the one-per-mailbox spacing rule is not tripped by them.
    await db.outreachMessage.updateMany({ where: { state: "SCHEDULED", id: { notIn: byTarget(0).map((m) => m.id) } }, data: { state: "CANCELLED" } });
    process.env.EXTERNAL_FAKES = "true";
    try {
      await advanceClock(at(s1).getTime() - Date.now());
      const spy = fakeMailbox;
      const first = await dispatchDueMessages();
      expect(first.dispatched).toBeGreaterThanOrEqual(1);
      expect(spy.sent.some((m) => m.headers["X-Pilani-Send-Key"] === s1.sendKey)).toBe(true);
      const before = spy.sent.length;
      await dispatchDueMessages();
      expect(spy.sent.length).toBe(before);
    } finally {
      await resetClock();
      delete process.env.EXTERNAL_FAKES;
    }
    setQueueForTests(null);
  });

  it("recovers a claim orphaned by a dead worker: records it if the mail left, releases it if not", async () => {
    const { byTarget } = await scheduled(2);
    const a = byTarget(0)[0];
    const b = byTarget(1)[0];
    const old = new Date(Date.now() - 60 * 60_000);
    // A: the mail really went out before the worker died.
    fakeMailbox.reset();
    await mailbox.send(accountId, { from: { name: "A", email: "a@x.test" }, to: a.target.email!, subject: a.subject!, text: "t", attachments: [], messageId: "<x@y>", headers: { "X-Pilani-Send-Key": a.sendKey! } });
    await db.outreachMessage.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { state: "SENDING", claimedAt: old } });
    const res = await recoverStaleClaims(new Date(), mailbox);
    expect(res.recovered).toBe(1);
    expect(res.released).toBe(1);
    expect((await fresh(a.id)).state).toBe("SENT");
    expect((await fresh(b.id)).state).toBe("SCHEDULED");
    expect(fakeMailbox.sent).toHaveLength(1); // nothing was sent twice
  });
});
