/**
 * Runs once when a server instance starts. In production it refuses to boot with a missing or malformed
 * secret (names only are reported, never values). It is skipped during `next build`, so building needs no secrets.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertEnv } = await import("@/lib/env-check");
  assertEnv();
}
