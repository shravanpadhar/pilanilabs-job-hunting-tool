import path from "node:path";
import { defineConfig } from "vitest/config";

// Database tests: need a local Postgres (npm run db:local) with migrations applied. They refuse to run
// against anything that is not localhost, so they can never touch a real Supabase project.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["tests/db/setup.ts"],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
