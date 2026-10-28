import { env } from "@/lib/env";
import { QUEUE_FUNCTIONS } from "@/lib/providers/queue/functions";
import { InlineQueue } from "@/lib/providers/queue/inline";
import { InngestQueue } from "@/lib/providers/queue/inngest";
import type { QueueProvider } from "@/lib/providers/queue/types";

let cached: QueueProvider | null = null;

/** The configured queue: Inngest in production, the in-process fake otherwise (see QUEUE_PROVIDER). */
export function getQueue(): QueueProvider {
  cached ??= env.queueProvider === "inngest" ? new InngestQueue() : new InlineQueue(QUEUE_FUNCTIONS);
  return cached;
}

/** Tests: replace or reset the singleton. */
export function setQueueForTests(q: QueueProvider | null) {
  cached = q;
}

export { InlineQueue, QUEUE_FUNCTIONS };
export type { QueueProvider };
