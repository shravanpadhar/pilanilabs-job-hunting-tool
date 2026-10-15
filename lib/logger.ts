type Ctx = Record<string, unknown>;

function serializeError(err: unknown): Ctx {
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack?.split("\n").slice(0, 4).join(" | ") };
  return { message: String(err) };
}

function emit(level: "info" | "warn" | "error", event: string, ctx: Ctx = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...ctx });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured server logs. Always include a `source` / `feature` in ctx when relevant. */
export const log = {
  info: (event: string, ctx?: Ctx) => emit("info", event, ctx),
  warn: (event: string, ctx?: Ctx) => emit("warn", event, ctx),
  error: (event: string, err?: unknown, ctx: Ctx = {}) =>
    emit("error", event, { ...ctx, ...(err === undefined ? {} : { error: serializeError(err) }) }),
};
