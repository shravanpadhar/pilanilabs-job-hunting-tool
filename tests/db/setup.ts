// Runs before every DB test file. Safety first: never run against a non-local database.
const DEFAULT_URL = "postgresql://postgres:postgres@localhost:54329/pilanilabs";
const url = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  throw new Error(`Refusing to run DB tests against non-local host "${host}". Use npm run db:local.`);
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.SUPPRESSION_HASH_KEY = "test-suppression-hash-key-0123456789abcdef";
process.env.TOKEN_ENCRYPTION_KEY = "22".repeat(32);
delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
