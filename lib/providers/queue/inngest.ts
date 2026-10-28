import { Inngest } from "inngest";
import { env } from "@/lib/env";
import { parseEvent, type EventInput, type EventName } from "@/lib/providers/queue/events";
import { QUEUE_FUNCTIONS } from "@/lib/providers/queue/functions";
import type { QueueFunction, QueueProvider, SendOptions } from "@/lib/providers/queue/types";

/** One Inngest client for the app. Keys come from env (INNGEST_EVENT_KEY to send, INNGEST_SIGNING_KEY to serve). */
export const inngestClient = new Inngest({ id: "pilanilabs-career-platform", eventKey: env.inngestEventKey });

export class InngestQueue implements QueueProvider {
  readonly name = "inngest" as const;

  async send<N extends EventName>(name: N, data: EventInput<N>, opts: SendOptions = {}): Promise<void> {
    const payload = parseEvent(name, data); // validate before it leaves the process
    await inngestClient.send({ name, data: payload, ...(opts.id ? { id: opts.id } : {}) });
  }
}

/** Turn the backend-neutral registry into Inngest functions for the /api/inngest route. */
export function buildInngestFunctions(functions: QueueFunction[] = QUEUE_FUNCTIONS) {
  return functions.map((fn) => {
    const triggers = "event" in fn.trigger ? [{ event: fn.trigger.event }] : [{ cron: fn.trigger.cron }];
    return inngestClient.createFunction(
      { id: fn.id, retries: fn.retries ?? 3, triggers } as never,
      (async ({ event }: { event?: { name: string; data: unknown } }) => {
        // Validate the payload again at the boundary: never trust an event body.
        const data = event && "event" in fn.trigger ? parseEvent(fn.trigger.event, event.data) : undefined;
        return (fn.handler as (d: unknown) => Promise<unknown>)(data);
      }) as never,
    );
  });
}
