import { log } from "@/lib/logger";
import { parseEvent, type EventInput, type EventName } from "@/lib/providers/queue/events";
import type { QueueFunction, QueueProvider, SendOptions } from "@/lib/providers/queue/types";

/**
 * In-process queue used for local development and every test (no Inngest account or server needed).
 * It runs the same registered functions, with the same retry count, but synchronously in this process.
 * `send()` resolves after the functions finish, and records what ran so tests can assert on it.
 */
export class InlineQueue implements QueueProvider {
  readonly name = "inline" as const;
  readonly delivered: Array<{ name: string; data: unknown; functionId: string; attempts: number; ok: boolean }> = [];
  private seen = new Set<string>();

  constructor(private functions: QueueFunction[]) {}

  async send<N extends EventName>(name: N, data: EventInput<N>, opts: SendOptions = {}): Promise<void> {
    if (opts.id) {
      if (this.seen.has(opts.id)) return; // de-duplicated, like Inngest event ids
      this.seen.add(opts.id);
    }
    const payload = parseEvent(name, data);
    for (const fn of this.functions) {
      if (!("event" in fn.trigger) || fn.trigger.event !== name) continue;
      await this.run(fn, name, payload);
    }
  }

  /** Run a cron function once, as the scheduler would. Used by tests and by the dev-only tick route. */
  async runCron(id: string): Promise<void> {
    const fn = this.functions.find((f) => f.id === id && "cron" in f.trigger);
    if (!fn) throw new Error(`No cron function "${id}".`);
    await this.run(fn, "cron", undefined);
  }

  private async run(fn: QueueFunction, name: string, data: unknown): Promise<void> {
    const maxAttempts = (fn.retries ?? 3) + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await (fn.handler as (d: unknown) => Promise<unknown>)(data);
        this.delivered.push({ name, data, functionId: fn.id, attempts: attempt, ok: true });
        return;
      } catch (err) {
        log.warn("queue_function_failed", { functionId: fn.id, attempt, message: (err as Error).message });
        if (attempt === maxAttempts) this.delivered.push({ name, data, functionId: fn.id, attempts: attempt, ok: false });
      }
    }
  }
}
