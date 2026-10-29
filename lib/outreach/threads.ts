import { clockNow } from "@/lib/clock";
import { db } from "@/lib/db";
import { linkedinActions } from "@/lib/outreach/linkedin";
import { notFound } from "@/lib/errors";

/** Everything the inbox needs for one campaign: a thread per person with its messages, replies and next step. */
export async function loadThreads(userId: string, campaignId: string) {
  const c = await db.outreachCampaign.findFirst({
    where: { id: campaignId, userId },
    include: {
      targets: {
        where: { state: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
        include: { messages: { orderBy: [{ channel: "asc" }, { step: "asc" }], include: { replies: { orderBy: { receivedAt: "asc" } } } }, linkedin: true },
      },
    },
  });
  if (!c) throw notFound("Campaign");
  const app = c.jobId ? await db.application.findUnique({ where: { userId_jobId: { userId, jobId: c.jobId } }, select: { status: true } }) : null;
  const snap = c.jobSnapshot as { title?: string; company?: string };
  const now = await clockNow();

  return {
    id: c.id,
    status: c.status,
    job: { title: snap.title ?? "Job", company: snap.company ?? "" },
    applicationStatus: app?.status ?? null,
    targets: c.targets.map((t) => {
      const emails = t.messages.filter((m) => m.channel === "EMAIL");
      const next = emails.filter((m) => m.state === "SCHEDULED" && m.scheduledAt).sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
      const threadId = emails.find((m) => m.threadId)?.threadId ?? null;
      return {
        id: t.id, fullName: t.fullName, title: t.title, email: t.email, state: t.state, roleType: t.roleType, linkedinUrl: t.linkedinUrl,
        nextStep: next ? { step: next.step, at: next.scheduledAt!.toISOString() } : null,
        gmailUrl: threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}` : null,
        messages: t.messages.map((m) => ({
          id: m.id, channel: m.channel, step: m.step, subject: m.subject, body: m.body, state: m.state, approved: m.approvedTextHash !== null && m.state !== "DRAFT",
          words: m.body.trim().split(/\s+/).filter(Boolean).length, scheduledAt: m.scheduledAt?.toISOString() ?? null, sentAt: m.sentAt?.toISOString() ?? null, lastError: m.lastError, templateKey: m.templateKey,
        })),
        replies: t.messages.flatMap((m) => m.replies.map((r) => ({ id: r.id, receivedAt: r.receivedAt.toISOString(), snippet: r.snippet, classification: r.classification, ruleHit: r.ruleHit, suggestedResponse: r.suggestedResponse }))),
        // Assisted mode: the profile link is the provider-supplied URL, or a plain people-search link the candidate opens themselves.
        linkedinProfileUrl: t.linkedinUrl ?? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${t.fullName} ${snap.company ?? ""}`.trim())}`,
        linkedin: {
          ...linkedinActions(t.linkedin, t.state, now),
          requestedAt: t.linkedin?.requestedAt?.toISOString() ?? null,
          expiresAt: t.linkedin?.expiresAt?.toISOString() ?? null,
          markedBy: t.linkedin?.markedBy ?? null,
        },
      };
    }),
  };
}
export type ThreadsView = Awaited<ReturnType<typeof loadThreads>>;
