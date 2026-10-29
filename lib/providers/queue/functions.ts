import { log } from "@/lib/logger";
import { completeFinishedSequences } from "@/lib/outreach/completion";
import { evaluateAllHealth } from "@/lib/outreach/health";
import { runLinkedInReminders } from "@/lib/outreach/linkedin";
import { dispatchPolls, pollMailbox } from "@/lib/outreach/replies";
import { dispatchDueMessages, sendMessage } from "@/lib/outreach/send";
import type { QueueFunction } from "@/lib/providers/queue/types";

/**
 * The registry of background functions. Both queue backends (Inngest and the in-process fake) run exactly this list.
 * Handlers are plain async code and safe to retry: the sender claims messages atomically and checks the send ledger.
 */
export const QUEUE_FUNCTIONS: QueueFunction[] = [
  {
    id: "system-ping",
    trigger: { event: "system/ping" },
    handler: async (data: { note: string }) => {
      log.info("queue_ping", { note: data.note });
      return { ok: true };
    },
  },
  {
    // The database holds the schedule; this tick turns "due" into one send event per message.
    id: "outreach-tick",
    trigger: { cron: "*/5 * * * *" },
    handler: async () => ({ ...(await dispatchDueMessages()), ...(await completeFinishedSequences()) }),
  },
  {
    // Every 10 minutes: one poll event per connected mailbox with a running campaign.
    id: "outreach-poll-dispatch",
    trigger: { cron: "*/10 * * * *" },
    handler: async () => ({ mailboxes: await dispatchPolls() }),
  },
  {
    id: "outreach-poll",
    trigger: { event: "outreach/poll.requested" },
    retries: 3,
    handler: async (data: { accountId: string }) => pollMailbox(data.accountId),
  },
  {
    id: "outreach-send",
    trigger: { event: "outreach/send.requested" },
    retries: 3,
    handler: async (data: { messageId: string }) => sendMessage(data.messageId),
  },
  {
    // Hourly: LinkedIn day-7 reminders, day-14 expiry prompts (withdraw, do not message), and the expiry record.
    id: "outreach-linkedin",
    trigger: { cron: "23 * * * *" },
    handler: async () => runLinkedInReminders(),
  },
  {
    id: "outreach-health",
    trigger: { cron: "17 * * * *" },
    handler: async () => ({ paused: await evaluateAllHealth() }),
  },
];
