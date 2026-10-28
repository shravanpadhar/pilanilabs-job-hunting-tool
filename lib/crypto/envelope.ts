import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { parseKey32 } from "@/lib/crypto/key";
import { env } from "@/lib/env";

/**
 * Envelope encryption for secrets at rest (mailbox refresh tokens).
 *
 * Every value gets its own random 256-bit data key (DEK). The DEK encrypts the value with AES-256-GCM and is
 * itself wrapped (AES-256-GCM) by the key-encryption key (KEK) from TOKEN_ENCRYPTION_KEY. Stored format:
 *
 *   v1.<kid>.<wrappedDek>.<dekIv>.<dekTag>.<iv>.<tag>.<ciphertext>      (each part base64url)
 *
 * `kid` is a short fingerprint of the KEK that wrapped the DEK, so after a rotation (new key in
 * TOKEN_ENCRYPTION_KEY, old key in TOKEN_ENCRYPTION_KEY_PREVIOUS) old values still decrypt and can be
 * lazily re-wrapped with `rewrap`. Authentication tags make any tampering fail loudly.
 */
const VERSION = "v1";
const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

/** Short, non-reversible fingerprint that identifies which KEK wrapped a value. */
export const keyId = (kek: Buffer) => createHash("sha256").update("kid:").update(kek).digest("base64url").slice(0, 8);

function keks(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const current = parseKey32(env.tokenEncryptionKey);
  if (!current) throw new CryptoError("TOKEN_ENCRYPTION_KEY is missing or is not 32 bytes (64 hex chars or base64).");
  out.set(keyId(current), current);
  const previous = parseKey32(env.tokenEncryptionKeyPrevious);
  if (previous) out.set(keyId(previous), previous);
  return out;
}

function currentKek(): { kid: string; key: Buffer } {
  const key = parseKey32(env.tokenEncryptionKey);
  if (!key) throw new CryptoError("TOKEN_ENCRYPTION_KEY is missing or is not 32 bytes (64 hex chars or base64).");
  return { kid: keyId(key), key };
}

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Encrypt `plaintext`. `context` (for example the account id) is authenticated but not secret: a value can't be moved to another record. */
export function encryptSecret(plaintext: string, context = ""): string {
  const { kid, key: kek } = currentKek();
  const dek = randomBytes(32);
  const wrapped = gcmEncrypt(kek, dek, `dek:${kid}`);
  const body = gcmEncrypt(dek, Buffer.from(plaintext, "utf8"), `val:${context}`);
  return [VERSION, kid, b64(wrapped.ct), b64(wrapped.iv), b64(wrapped.tag), b64(body.iv), b64(body.tag), b64(body.ct)].join(".");
}

/** Decrypt a value produced by `encryptSecret`. Throws CryptoError on a wrong key, wrong context or tampering. */
export function decryptSecret(stored: string, context = ""): string {
  const parts = stored.split(".");
  if (parts.length !== 8 || parts[0] !== VERSION) throw new CryptoError("Unrecognised encrypted value format.");
  const [, kid, wrappedDek, dekIv, dekTag, iv, tag, ct] = parts;
  const kek = keks().get(kid);
  if (!kek) throw new CryptoError("No key available for this value (was TOKEN_ENCRYPTION_KEY rotated without keeping the previous key?).");
  try {
    const dek = gcmDecrypt(kek, unb64(dekIv), unb64(dekTag), unb64(wrappedDek), `dek:${kid}`);
    return gcmDecrypt(dek, unb64(iv), unb64(tag), unb64(ct), `val:${context}`).toString("utf8");
  } catch {
    throw new CryptoError("Could not decrypt value (wrong key, wrong context, or the data was modified).");
  }
}

/** True when the value was wrapped by an older key and should be re-encrypted with the current one. */
export function needsRewrap(stored: string): boolean {
  return stored.split(".")[1] !== currentKek().kid;
}

/** Re-encrypt under the current key (used lazily after a key rotation). */
export function rewrap(stored: string, context = ""): string {
  return encryptSecret(decryptSecret(stored, context), context);
}
