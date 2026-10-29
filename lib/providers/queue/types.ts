import type { EventData, EventInput, EventName } from "@/lib/providers/queue/events";

/** A background function: runs on an event or on a cron schedule. Plain async code so it works with any queue backend. */
export type QueueFunction =
  | { id: string; trigger: { event: EventName }; retries?: number; handler: (data: never) => Promise<unknown> }
  | { id: string; trigger: { cron: string }; retries?: number; handler: () => Promise<unknown> };

export interface SendOptions {
  /** De-duplication key: sending the same id twice enqueues one run. */
  id?: string;
}

/**
 * The durable queue. The web app only enqueues; anything slow or scheduled runs in a function that can retry safely.
 * Swap implementations by changing QUEUE_PROVIDER (inngest | inline).
 */
export interface QueueProvider {
  readonly name: "inngest" | "inline";
  send<N extends EventName>(name: N, data: EventInput<N>, opts?: SendOptions): Promise<void>;
}

export type { EventData, EventInput, EventName };
