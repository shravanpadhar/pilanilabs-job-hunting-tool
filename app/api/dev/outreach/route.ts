import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth";
import { advanceClock, clockNow, resetClock } from "@/lib/clock";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { handler } from "@/lib/errors";
import { completeFinishedSequences } from "@/lib/outreach/completion";
import { dispatchDueMessages } from "@/lib/outreach/send";
import { pollMailbox } from "@/lib/outreach/replies";
import { fakeMailbox } from "@/lib/providers/mailbox/fake";
import { fakeNotifications } from "@/lib/providers/notify";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advance_clock"), ms: z.number().int().min(0).max(40 * 86_400_000) }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("tick") }),
  z.object({ action: z.literal("inject_reply"), text: z.string().min(1).max(2000), from: z.string().max(200).optional(), headers: z.record(z.string(), z.string()).optional() }),
  z.object({ action: z.literal("poll") }),
  z.object({ action: z.literal("state"), campaignId: z.string().optional() }),
]);

/**
 * TEST-ONLY hooks for local development and end-to-end tests: a fake clock, a manual sender tick, and reply injection
 * into the in-memory fake mailbox. The route does not exist (404) unless EXTERNAL_FAKES is on, which the production startup
 * check refuses, and `flags.externalFakes` is hard-false in production regardless.
 */
export const POST = handler("dev_outreach", async (request: Request) => {
  if (!flags.externalFakes) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const user = await requireUserApi();
  const body = bodySchema.parse(await request.json());

  switch (body.action) {
    case "advance_clock": {
      const now = await advanceClock(body.ms);
      return NextResponse.json({ now: now.toISOString() });
    }
    case "reset": {
      await resetClock();
      fakeMailbox.reset();
      fakeNotifications.reset();
      // Keep repeated test runs independent: today's AI quota and the cost window start empty again.
      await db.outreachMessage.updateMany({ where: { target: { campaign: { userId: user.id } }, state: { in: ["DRAFT", "APPROVED", "SCHEDULED", "FAILED"] } }, data: { state: "CANCELLED", scheduledAt: null } });
      await db.outreachCampaign.updateMany({ where: { userId: user.id, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
      // Sends made under the advanced test clock are stamped in the "future" of the real clock: move them into the past so they
      // cannot count toward today's cap or spacing in the next test.
      await db.outreachMessage.updateMany({ where: { state: "SENT", target: { campaign: { userId: user.id } } }, data: { sentAt: new Date(Date.now() - 30 * 86_400_000) } });
      await db.aiUsage.deleteMany({ where: { userId: user.id } });
      await db.providerUsage.deleteMany({ where: { userId: user.id } });
      return NextResponse.json({ ok: true });
    }
    case "tick": {
      const dispatched = await dispatchDueMessages();
      const completed = await completeFinishedSequences();
      return NextResponse.json({ ...dispatched, ...completed, now: (await clockNow()).toISOString() });
    }
    case "inject_reply": {
      const sent = await db.outreachMessage.findFirst({ where: { channel: "EMAIL", state: "SENT", threadId: { not: null }, target: { campaign: { userId: user.id } } }, orderBy: { sentAt: "desc" } });
      if (!sent?.threadId) return NextResponse.json({ error: "No sent email to reply to yet." }, { status: 409 });
      const target = await db.outreachTarget.findUniqueOrThrow({ where: { id: sent.targetId } });
      fakeMailbox.injectInbound(sent.threadId, { from: body.from ?? `${target.fullName} <${target.email}>`, text: body.text, headers: body.headers });
      return NextResponse.json({ ok: true, threadId: sent.threadId });
    }
    case "poll": {
      const account = await db.connectedAccount.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
      return NextResponse.json(account ? await pollMailbox(account.id) : { checked: 0, processed: 0 });
    }
    case "state": {
      const sent = await db.outreachMessage.count({ where: { channel: "EMAIL", state: "SENT", target: { campaign: { userId: user.id, ...(body.campaignId ? { id: body.campaignId } : {}) } } } });
      const lastText = fakeMailbox.sent.at(-1)?.text ?? "";
      return NextResponse.json({
        sentInDb: sent, mailboxSent: fakeMailbox.sent.length, notifications: fakeNotifications.sent.map((n) => n.subject), now: (await clockNow()).toISOString(),
        // The opt-out link at the foot of the last email, as a recipient would click it.
        lastOptOutPath: lastText.match(/\/u\/[\w-]+\.[\w-]+/)?.[0] ?? null,
        lastHasAttachment: (fakeMailbox.sent.at(-1)?.attachments.length ?? 0) > 0,
      });
    }
  }
});
