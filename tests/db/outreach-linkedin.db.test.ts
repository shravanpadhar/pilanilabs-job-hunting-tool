import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { grantCredits } from "@/lib/billing/credits";
import { db } from "@/lib/db";
import { activateCampaign } from "@/lib/outreach/activate";
import { approveMessage } from "@/lib/outreach/approval";
import { createCampaignFromExtracted } from "@/lib/outreach/campaigns";
import { generateDraftsForCampaign } from "@/lib/outreach/draft";
import { applyLinkedInEvent, runLinkedInReminders } from "@/lib/outreach/linkedin";
import { loadThreads } from "@/lib/outreach/threads";
import { saveOutreachProfile } from "@/lib/outreach/profile";
import { acknowledgeRisk, discoverTargets } from "@/lib/outreach/targets";
import { toTargetViews } from "@/lib/outreach/view";
import { saveConnectedAccount } from "@/lib/providers/mailbox/accounts";
import { fakeNotifications } from "@/lib/providers/notify";
import { resumeSchema } from "@/lib/resume/schema";

process.env.AI_PROVIDER = "fake";

const tag = `ol${Date.now()}`;
const userId = randomUUID();
let counter = 0;
const day = (n: number) => new Date(Date.now() + n * 86_400_000);

/** A running campaign for one person with the LinkedIn note approved (the email lane is scheduled, nothing sent yet). */
async function running() {
  const label = `${++counter}`;
  const { campaign } = await createCampaignFromExtracted(userId, { title: "Senior Frontend Engineer", company: `Co${label}${tag}`, location: "Bengaluru, India", description: "Build React apps.\n- 4+ years of React", requirements: ["4+ years of React"], sourceUrl: `https://careers.co${label}${tag}.com/j/1`, applyUrl: null, source: "link" });
  await discoverTargets({ userId, campaignId: campaign.id, limit: 1 });
  for (const v of await toTargetViews(await db.outreachTarget.findMany({ where: { campaignId: campaign.id } }))) if (v.needsDecision.length && !v.hardBlocks.length) await acknowledgeRisk(userId, v.id);
  await generateDraftsForCampaign(userId, campaign.id);
  const msgs = await db.outreachMessage.findMany({ where: { target: { campaignId: campaign.id } } });
  for (const m of msgs.filter((x) => x.channel === "EMAIL" || x.channel === "LINKEDIN_NOTE")) await approveMessage(userId, m.id);
  await activateCampaign(userId, campaign.id);
  const target = await db.outreachTarget.findFirstOrThrow({ where: { campaignId: campaign.id } });
  return { campaign, target };
}

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
  await saveConnectedAccount({ userId, provider: "GMAIL", accountEmail: `asha.${tag}@gmail.test`, refreshToken: "fake", scopes: ["gmail.send"] });
});
beforeEach(() => fakeNotifications.reset());
afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.companyProfile.deleteMany({ where: { slug: { startsWith: "co" } } });
  await db.$disconnect();
});

describe("the assisted LinkedIn flow", () => {
  it("runs request -> accepted -> message, and each step needs the candidate's approved text", async () => {
    const { target } = await running();
    const note = await db.outreachMessage.findFirstOrThrow({ where: { targetId: target.id, channel: "LINKEDIN_NOTE" } });
    expect(note.body.length).toBeLessThanOrEqual(300);
    expect(note.state).toBe("APPROVED");

    const sent = await applyLinkedInEvent(userId, target.id, "request_sent");
    expect(sent.state).toBe("CONNECT_PENDING");
    expect(sent.markedBy).toBe("USER");
    expect(sent.expiresAt!.getTime() - sent.requestedAt!.getTime()).toBe(14 * 86_400_000);
    expect((await db.outreachMessage.findUniqueOrThrow({ where: { id: note.id } })).state).toBe("SENT");

    // Cannot message before acceptance.
    await expect(applyLinkedInEvent(userId, target.id, "message_sent")).rejects.toMatchObject({ code: "illegal_linkedin_transition" });

    const accepted = await applyLinkedInEvent(userId, target.id, "accepted");
    expect(accepted.state).toBe("ACCEPTED");
    const msg = await db.outreachMessage.findFirstOrThrow({ where: { targetId: target.id, channel: "LINKEDIN_MESSAGE" } });
    expect(msg.state).toBe("DRAFT"); // drafted, but the candidate must approve it
    await expect(applyLinkedInEvent(userId, target.id, "message_sent")).rejects.toMatchObject({ code: "not_approved" });

    await approveMessage(userId, msg.id);
    const done = await applyLinkedInEvent(userId, target.id, "message_sent");
    expect(done.state).toBe("MESSAGED");
    expect((await db.outreachMessage.findUniqueOrThrow({ where: { id: msg.id } })).state).toBe("SENT");
    expect(await db.auditEvent.count({ where: { userId, entityId: target.id, action: { startsWith: "linkedin." } } })).toBeGreaterThanOrEqual(3);
  });

  it("the request cannot be recorded until the note is approved", async () => {
    const { target } = await running();
    await db.outreachMessage.updateMany({ where: { targetId: target.id, channel: "LINKEDIN_NOTE" }, data: { state: "DRAFT", approvedTextHash: null, approvedAt: null } });
    await expect(applyLinkedInEvent(userId, target.id, "request_sent")).rejects.toMatchObject({ code: "not_approved" });
  });

  it("a reply on the email lane freezes LinkedIn too, but withdrawing is always possible", async () => {
    const { target } = await running();
    await applyLinkedInEvent(userId, target.id, "request_sent");
    await db.outreachTarget.update({ where: { id: target.id }, data: { state: "REPLIED" } });
    await expect(applyLinkedInEvent(userId, target.id, "accepted")).rejects.toMatchObject({ code: "linkedin_frozen" });
    const view = (await loadThreads(userId, (await db.outreachTarget.findUniqueOrThrow({ where: { id: target.id } })).campaignId)).targets.find((t) => t.id === target.id)!;
    expect(view.linkedin.frozen).toBe(true);
    expect(view.linkedin.canMarkAccepted).toBe(false);
    expect((await applyLinkedInEvent(userId, target.id, "withdraw")).state).toBe("WITHDRAWN");
  });

  it("other users cannot act on this contact", async () => {
    const { target } = await running();
    await expect(applyLinkedInEvent(randomUUID(), target.id, "request_sent")).rejects.toThrow(/not found/i);
  });
});

describe("reminders and the 14-day expiry", () => {
  async function pendingSince(daysAgo: number) {
    const { target } = await running();
    await applyLinkedInEvent(userId, target.id, "request_sent");
    const requestedAt = day(-daysAgo);
    await db.linkedInStep.update({ where: { targetId: target.id }, data: { requestedAt, expiresAt: new Date(requestedAt.getTime() + 14 * 86_400_000) } });
    return target;
  }

  it("sends one reminder at day 7, one withdraw prompt at day 14, then records WITHDRAWN after the grace period", async () => {
    const t = await pendingSince(8);
    const r1 = await runLinkedInReminders(new Date());
    expect(r1.reminders).toBeGreaterThanOrEqual(1);
    expect(fakeNotifications.sent.some((n) => /Still waiting/.test(n.subject))).toBe(true);
    expect((await runLinkedInReminders(new Date())).reminders).toBe(0); // only once

    await db.linkedInStep.update({ where: { targetId: t.id }, data: { requestedAt: day(-15) } });
    const r2 = await runLinkedInReminders(new Date());
    expect(r2.expiryPrompts).toBeGreaterThanOrEqual(1);
    const prompt = fakeNotifications.sent.find((n) => /Withdraw your LinkedIn request/.test(n.subject))!;
    expect(prompt.text).toMatch(/do not message/i);
    expect((await runLinkedInReminders(new Date())).expiryPrompts).toBe(0);
    expect((await db.linkedInStep.findUniqueOrThrow({ where: { targetId: t.id } })).state).toBe("CONNECT_PENDING");

    await db.linkedInStep.update({ where: { targetId: t.id }, data: { requestedAt: day(-18) } });
    const r3 = await runLinkedInReminders(new Date());
    expect(r3.autoWithdrawn).toBeGreaterThanOrEqual(1);
    const step = await db.linkedInStep.findUniqueOrThrow({ where: { targetId: t.id } });
    expect(step.state).toBe("WITHDRAWN");
    expect(step.markedBy).toBe("SYSTEM");
    await expect(applyLinkedInEvent(userId, t.id, "message_sent")).rejects.toThrow(); // and we never message after expiry
  });

  it("the system never marks a request as accepted by itself", async () => {
    const t = await pendingSince(30);
    await runLinkedInReminders(new Date());
    const step = await db.linkedInStep.findUniqueOrThrow({ where: { targetId: t.id } });
    expect(step.state).not.toBe("ACCEPTED");
    expect(step.acceptedAt).toBeNull();
  });

  it("people whose email lane has ended get no reminders", async () => {
    const t = await pendingSince(10);
    await db.outreachTarget.update({ where: { id: t.id }, data: { state: "OPTED_OUT" } });
    fakeNotifications.reset();
    await runLinkedInReminders(new Date());
    expect(fakeNotifications.sent.filter((n) => n.text.includes(t.fullName))).toHaveLength(0);
  });
});
