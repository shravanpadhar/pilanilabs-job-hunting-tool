import { log } from "@/lib/logger";
import { evaluateAllHealth } from "@/lib/outreach/health";
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
    handler: async () => dispatchDueMessages(),
  },
  {
    id: "outreach-send",
    trigger: { event: "outreach/send.requested" },
    retries: 3,
    handler: async (data: { messageId: string }) => sendMessage(data.messageId),
  },
  {
    id: "outreach-health",
    trigger: { cron: "17 * * * *" },
    handler: async () => ({ paused: await evaluateAllHealth() }),
  },
];
