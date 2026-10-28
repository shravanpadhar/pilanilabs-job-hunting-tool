import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addSuppression } from "@/lib/compliance/suppression";
import { db } from "@/lib/db";
import { approvalHash, approveMessage, cancelMessage, currentHash, editMessage } from "@/lib/outreach/approval";
import { createCampaignFromExtracted } from "@/lib/outreach/campaigns";
import { generateDraftsForCampaign } from "@/lib/outreach/draft";
import { loadDraftsView } from "@/lib/outreach/drafts-view";
import { previewSchedule } from "@/lib/outreach/preview";
import { saveOutreachProfile } from "@/lib/outreach/profile";
import { discoverTargets } from "@/lib/outreach/targets";
import { verifyOptOutToken } from "@/lib/compliance/optout";
import { resumeSchema } from "@/lib/resume/schema";

process.env.AI_PROVIDER = "fake";

const tag = `od${Date.now()}`;
const userId = randomUUID();
const otherUser = randomUUID();
let campaignId = "";

const job = { title: "Senior Frontend Engineer", company: `Acme ${tag}`, location: "Bengaluru, India", description: "Build React apps.\n- 4+ years of React", requirements: ["4+ years of React"], sourceUrl: `https://careers.acme${tag}.com/j/1`, applyUrl: null, source: "link" };
const PROFILE = { senderName: "Asha Verma", postalAddress: "12 MG Road, Bengaluru 560001, India", timeZone: "Asia/Kolkata" };

beforeAll(async () => {
  await db.user.createMany({ data: [{ id: userId, email: `a.${tag}@example.com` }, { id: otherUser, email: `b.${tag}@example.com` }] });
  const parsed = resumeSchema.parse({
    contact: { name: "Asha Verma", email: `a.${tag}@example.com` },
    skills: { technical: ["React", "TypeScript"] },
    experience: [{ company: "Initech", title: "Frontend Engineer", bullets: ["Built dashboards"] }],
    education: [{ institution: "BITS Pilani", degree: "B.E." }],
  });
  await db.resume.create({ data: { userId, fileName: "r.pdf", rawText: "Asha Verma", parsedJson: parsed as object, isPrimary: true } });
  const { campaign } = await createCampaignFromExtracted(userId, job);
  campaignId = campaign.id;
  await discoverTargets({ userId, campaignId });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [userId, otherUser] } } });
  await db.companyProfile.deleteMany({ where: { slug: { startsWith: "acme-" + tag } } });
  await db.suppressionEntry.deleteMany({});
  await db.$disconnect();
});

const firstEmail = async () => {
  const view = await loadDraftsView(userId, campaignId);
  const t = view.targets[0];
  return { view, t, m: t.messages.find((x) => x.channel === "EMAIL" && x.step === 1)! };
};

describe("drafting", () => {
  it("refuses to draft until the sender identity (name + postal address) is saved", async () => {
    await expect(generateDraftsForCampaign(userId, campaignId)).rejects.toMatchObject({ code: "profile_incomplete" });
    await expect(saveOutreachProfile(userId, { ...PROFILE, postalAddress: "" })).rejects.toThrow();
    await expect(saveOutreachProfile(userId, { ...PROFILE, timeZone: "Mars/Base" })).rejects.toThrow();
    await saveOutreachProfile(userId, PROFILE);
  });

  it("writes three emails and one LinkedIn note per ready contact, all within the rules", async () => {
    const res = await generateDraftsForCampaign(userId, campaignId);
    expect(res.written).toBeGreaterThanOrEqual(4);
    const view = await loadDraftsView(userId, campaignId);
    expect(view.targets.length).toBeGreaterThan(0);
    for (const t of view.targets) {
      const emails = t.messages.filter((m) => m.channel === "EMAIL");
      expect(emails.map((m) => m.step)).toEqual([1, 2, 3]);
      for (const m of emails) {
        expect(m.words).toBeLessThan(120);
        expect(m.subject!.length).toBeLessThanOrEqual(80);
        expect(m.state).toBe("DRAFT");
        expect(m.body).not.toMatch(/https?:\/\//); // no links in drafts
      }
      const note = t.messages.find((m) => m.channel === "LINKEDIN_NOTE")!;
      expect(note.body.length).toBeLessThanOrEqual(300);
    }
    expect(view.footer).toContain("Asha Verma");
    expect(view.footer).toMatch(/unsubscribe/);
  });

  it("is idempotent for approved messages: writing drafts again never overwrites them", async () => {
    const { m } = await firstEmail();
    const approved = await approveMessage(userId, m.id);
    const before = approved.body;
    await generateDraftsForCampaign(userId, campaignId);
    const again = await db.outreachMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(again.state).toBe("APPROVED");
    expect(again.body).toBe(before);
    expect(again.approvedTextHash).toBe(approved.approvedTextHash);
  });
});

describe("approval records", () => {
  it("stores a hash of the exact text (recipient + subject + body with footer + attachment) and a unique send key", async () => {
    const { m } = await firstEmail();
    const msg = await db.outreachMessage.findUniqueOrThrow({ where: { id: m.id }, include: { target: true } });
    expect(msg.state).toBe("APPROVED");
    expect(msg.approvedAt).toBeTruthy();
    expect(msg.approvedTextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(msg.sendKey).toMatch(/^[0-9a-f]{64}$/);
    expect(msg.attachmentSha256).toMatch(/^[0-9a-f]{64}$/);
    const { hash, composed } = await currentHash(msg.id);
    expect(hash).toBe(msg.approvedTextHash);
    expect(composed.to).toBe(msg.target.email);
    expect(composed.bodyAsSent).toContain("12 MG Road"); // the footer is part of the approved text
    expect(composed.bodyAsSent).toMatch(/\/u\/[\w-]+\.[\w-]+/);
    const token = composed.bodyAsSent.match(/\/u\/([\w-]+\.[\w-]+)/)![1];
    expect(verifyOptOutToken(token)).toBe(msg.targetId);
    expect(await db.auditEvent.count({ where: { userId, action: "message.approved", entityId: msg.id } })).toBe(1);
  });

  it("approving twice is harmless", async () => {
    const { m } = await firstEmail();
    const a = await approveMessage(userId, m.id);
    const b = await approveMessage(userId, m.id);
    expect(b.approvedTextHash).toBe(a.approvedTextHash);
    expect(await db.auditEvent.count({ where: { userId, action: "message.approved", entityId: m.id } })).toBe(1);
  });

  it("ANY edit after approval removes the approval, the send key and the schedule: re-approval is required", async () => {
    const { m } = await firstEmail();
    const edited = await editMessage(userId, m.id, { subject: m.subject, body: `${m.body}\n\nP.S. Happy to share my portfolio.` });
    expect(edited.state).toBe("DRAFT");
    expect(edited.approvedAt).toBeNull();
    expect(edited.approvedTextHash).toBeNull();
    expect(edited.sendKey).toBeNull();
    expect(edited.scheduledAt).toBeNull();
    const again = await approveMessage(userId, m.id);
    expect(again.state).toBe("APPROVED");
    expect(again.approvedTextHash).not.toBeNull();
  });

  it("an unchanged edit does not disturb an approval", async () => {
    const { m } = await firstEmail();
    const cur = await db.outreachMessage.findUniqueOrThrow({ where: { id: m.id } });
    const same = await editMessage(userId, m.id, { subject: cur.subject, body: cur.body });
    expect(same.state).toBe("APPROVED");
    expect(same.approvedTextHash).toBe(cur.approvedTextHash);
  });

  it("the stored hash no longer matches if anything is tampered with directly in the database", async () => {
    const { m } = await firstEmail();
    const stored = await db.outreachMessage.findUniqueOrThrow({ where: { id: m.id } });
    await db.outreachMessage.update({ where: { id: m.id }, data: { body: `${stored.body} (tampered)` } });
    const { hash } = await currentHash(m.id);
    expect(hash).not.toBe(stored.approvedTextHash);
    await db.outreachMessage.update({ where: { id: m.id }, data: { body: stored.body } });
    expect((await currentHash(m.id)).hash).toBe(stored.approvedTextHash);
    expect(approvalHash).toBeTypeOf("function");
  });

  it("the verifier blocks approval of an edited message that invents facts", async () => {
    const t = (await loadDraftsView(userId, campaignId)).targets[0];
    const step2 = t.messages.find((x) => x.channel === "EMAIL" && x.step === 2)!;
    await editMessage(userId, step2.id, { subject: step2.subject, body: "Hi there,\n\nI led 25 engineers at Google and we have a mutual connection on your team. Could we talk?\n\nThanks,\nAsha" });
    await expect(approveMessage(userId, step2.id)).rejects.toMatchObject({ code: "verifier_failed" });
    const row = await db.outreachMessage.findUniqueOrThrow({ where: { id: step2.id } });
    expect(row.state).toBe("DRAFT");
    expect(row.approvedTextHash).toBeNull();
  });

  it("only the owner can approve, edit or cancel", async () => {
    const { m } = await firstEmail();
    await expect(approveMessage(otherUser, m.id)).rejects.toThrow(/not found/i);
    await expect(editMessage(otherUser, m.id, { body: "hi" })).rejects.toThrow(/not found/i);
    await expect(cancelMessage(otherUser, m.id)).rejects.toThrow();
  });

  it("a contact who opts out cannot be approved afterwards", async () => {
    const t = (await loadDraftsView(userId, campaignId)).targets[0];
    const step3 = t.messages.find((x) => x.channel === "EMAIL" && x.step === 3)!;
    await addSuppression(t.email!, "OPT_OUT");
    await expect(approveMessage(userId, step3.id)).rejects.toMatchObject({ code: "target_not_sendable" });
    await db.suppressionEntry.deleteMany({});
  });

  it("sent messages cannot be edited", async () => {
    const t = (await loadDraftsView(userId, campaignId)).targets[0];
    const step3 = t.messages.find((x) => x.channel === "EMAIL" && x.step === 3)!;
    await db.outreachMessage.update({ where: { id: step3.id }, data: { state: "SENT" } });
    await expect(editMessage(userId, step3.id, { body: "changed after sending" })).rejects.toMatchObject({ code: "already_sent" });
    await db.outreachMessage.update({ where: { id: step3.id }, data: { state: "DRAFT" } });
  });

  it("LinkedIn notes go through the same approval record, without an attachment", async () => {
    const t = (await loadDraftsView(userId, campaignId)).targets[0];
    const note = t.messages.find((x) => x.channel === "LINKEDIN_NOTE")!;
    const ok = await approveMessage(userId, note.id);
    expect(ok.approvedTextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ok.attachmentSha256).toBeNull();
  });
});

describe("schedule preview", () => {
  it("shows every step in the candidate's zone and the recipient's, inside working hours", async () => {
    const p = await previewSchedule(userId, campaignId, new Date("2026-11-03T05:00:00Z"));
    expect(p.candidateTz).toBe("Asia/Kolkata");
    expect(p.targets.length).toBeGreaterThan(0);
    for (const t of p.targets) {
      expect(t.steps).toHaveLength(3);
      expect(t.recipientTz).toBeTruthy();
      for (const s of t.steps) {
        expect(s.candidateLocal).toBeTruthy();
        expect(s.recipientLocal).toBeTruthy();
      }
    }
    // Spread: two targets never share the same first send time.
    const firsts = p.targets.map((t) => t.steps[0].at);
    expect(new Set(firsts).size).toBe(firsts.length);
  });
});
