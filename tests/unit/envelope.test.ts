import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CryptoError, decryptSecret, encryptSecret, keyId, needsRewrap, rewrap } from "@/lib/crypto/envelope";
import { parseKey32 } from "@/lib/crypto/key";

const KEY_A = "11".repeat(32);
const KEY_B = Buffer.alloc(32, 9).toString("base64");

const saved = { cur: process.env.TOKEN_ENCRYPTION_KEY, prev: process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS };
beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY_A;
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
});
afterEach(() => {
  if (saved.cur === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = saved.cur;
  if (saved.prev === undefined) delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  else process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = saved.prev;
});

describe("parseKey32", () => {
  it("accepts 64 hex chars and 32-byte base64, rejects everything else", () => {
    expect(parseKey32(KEY_A)?.length).toBe(32);
    expect(parseKey32(KEY_B)?.length).toBe(32);
    expect(parseKey32("short")).toBeNull();
    expect(parseKey32(undefined)).toBeNull();
    expect(parseKey32("z".repeat(64))).toBeNull();
  });
});

describe("envelope encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret("1//refresh-token-value", "acct:1");
    expect(stored).not.toContain("refresh-token-value");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(decryptSecret(stored, "acct:1")).toBe("1//refresh-token-value");
  });

  it("uses a fresh data key and nonce each time", () => {
    const a = encryptSecret("same", "c");
    const b = encryptSecret("same", "c");
    expect(a).not.toBe(b);
    expect(decryptSecret(a, "c")).toBe(decryptSecret(b, "c"));
  });

  it("is bound to its context: a token moved to another record will not decrypt", () => {
    const stored = encryptSecret("tok", "acct:user-1");
    expect(() => decryptSecret(stored, "acct:user-2")).toThrow(CryptoError);
  });

  it("detects tampering in every part", () => {
    const parts = encryptSecret("tok", "c").split(".");
    for (let i = 2; i < parts.length; i++) {
      const mutated = [...parts];
      const buf = Buffer.from(mutated[i], "base64url");
      buf[0] ^= 0xff;
      mutated[i] = buf.toString("base64url");
      expect(() => decryptSecret(mutated.join("."), "c")).toThrow(CryptoError);
    }
    expect(() => decryptSecret("garbage", "c")).toThrow(CryptoError);
  });

  it("fails clearly (without echoing keys) when the key is missing or wrong", () => {
    const stored = encryptSecret("tok", "c");
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(stored, "c")).toThrow(/rotated/);
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    try {
      encryptSecret("x");
    } catch (e) {
      expect((e as Error).message).not.toContain(KEY_A);
    }
  });

  it("supports key rotation: old values decrypt with the previous key and re-wrap to the new one", () => {
    const old = encryptSecret("tok", "c");
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    expect(decryptSecret(old, "c")).toBe("tok");
    expect(needsRewrap(old)).toBe(true);
    const moved = rewrap(old, "c");
    expect(needsRewrap(moved)).toBe(false);
    expect(decryptSecret(moved, "c")).toBe("tok");
    // After the old key is retired, only re-wrapped values survive.
    delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    expect(decryptSecret(moved, "c")).toBe("tok");
    expect(() => decryptSecret(old, "c")).toThrow(CryptoError);
  });

  it("key ids are stable, short and do not reveal the key", () => {
    const k = parseKey32(KEY_A)!;
    expect(keyId(k)).toBe(keyId(k));
    expect(keyId(k)).toHaveLength(8);
    expect(KEY_A).not.toContain(keyId(k));
  });
});
