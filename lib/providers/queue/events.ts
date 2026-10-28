import { z } from "zod";

/**
 * Every queue event and its payload schema. Payloads carry ids only, never personal data or secrets:
 * workers re-read the database, so a replayed or forged event cannot change what gets sent.
 */
export const EVENT_SCHEMAS = {
  /** Smoke-test event used by tests and the queue health check. */
  "system/ping": z.object({ note: z.string().max(100).default("") }),
  /** Send one approved, scheduled message (idempotent: the worker claims it atomically). */
  "outreach/send.requested": z.object({ messageId: z.string().min(1) }),
  /** Poll one connected mailbox for replies and bounces. */
  "outreach/poll.requested": z.object({ accountId: z.string().min(1) }),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventData<N extends EventName> = z.output<(typeof EVENT_SCHEMAS)[N]>;
export type EventInput<N extends EventName> = z.input<(typeof EVENT_SCHEMAS)[N]>;

export function parseEvent<N extends EventName>(name: N, data: unknown): EventData<N> {
  return EVENT_SCHEMAS[name].parse(data) as EventData<N>;
}
