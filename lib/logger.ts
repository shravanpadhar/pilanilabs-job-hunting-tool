type Ctx = Record<string, unknown>;

// Secrets must never reach the logs. Fields with these names are replaced, and values that look like
// credentials are masked wherever they appear (error messages and stack lines included).
const SECRET_KEY = /secret|token|password|passwd|authorization|api[_-]?key|cookie|signing|encryption|private[_-]?key|refresh/i;
const SECRET_VALUE = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g, // Anthropic / OpenAI-style keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /\bv1\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]{20,}/g, // our encrypted values
];

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return SECRET_VALUE.reduce((s, re) => s.replace(re, "[redacted]"), value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

function serializeError(err: unknown): Ctx {
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack?.split("\n").slice(0, 4).join(" | ") };
  return { message: String(err) };
}

function emit(level: "info" | "warn" | "error", event: string, ctx: Ctx = {}) {
  const line = JSON.stringify(redact({ t: new Date().toISOString(), level, event, ...ctx }));
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
