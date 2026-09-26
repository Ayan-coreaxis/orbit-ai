import crypto from "crypto";

/**
 * AES-256-GCM for secrets kept in the database (API keys saved from Super Admin). The key is
 * derived from AUTH_SECRET — rotating AUTH_SECRET means re-entering those keys.
 * Format: "v1:" + base64url(iv | tag | ciphertext).
 */

function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return crypto.createHash("sha256").update(`orbit-secret-box:${s}`).digest();
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url")}`;
}

export function open(sealed: string): string | null {
  try {
    if (!sealed.startsWith("v1:")) return null;
    const raw = Buffer.from(sealed.slice(3), "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
