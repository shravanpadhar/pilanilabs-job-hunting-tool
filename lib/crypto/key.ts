/**
 * Parse a 32-byte secret given as 64 hex characters or as base64 (44 chars with padding).
 * Returns null when the value is missing or the wrong length, so callers can report a clear error
 * without ever echoing the value.
 */
export function parseKey32(value: string | undefined): Buffer | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) {
    const buf = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (buf.length === 32) return buf;
  }
  return null;
}
