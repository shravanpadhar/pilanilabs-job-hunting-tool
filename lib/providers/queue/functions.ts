import { log } from "@/lib/logger";
import type { QueueFunction } from "@/lib/providers/queue/types";

/**
 * The registry of background functions. Later phases add theirs here (sender, reply poller, LinkedIn
 * reminders, health check). Both queue backends execute exactly this list.
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
];
