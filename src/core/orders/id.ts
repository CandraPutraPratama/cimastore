/**
 * ID pesanan: <prefix brand>-<6 karakter>, contoh KK-7F3K9Q.
 * Tanpa karakter yang mirip (I, O, 0, 1) supaya gampang dibacakan ke admin.
 */

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RandomBytes = (length: number) => Uint8Array;

export const cryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function generateOrderId(prefix: string, random: RandomBytes = cryptoRandomBytes): string {
  if (!/^[A-Z]{2,3}$/.test(prefix)) throw new Error(`Prefix pesanan tidak valid: ${prefix}`);
  // 256 habis dibagi 32, jadi modulo tidak membuat huruf tertentu lebih sering muncul.
  const suffix = Array.from(random(6), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
  return `${prefix}-${suffix}`;
}

/** Token akses rahasia per pesanan (base64url, 32 byte). Hanya hash-nya yang disimpan. */
export function generateAccessToken(random: RandomBytes = cryptoRandomBytes): string {
  const bytes = random(32);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function isWellFormedOrderId(id: string): boolean {
  return /^[A-Z]{2,3}-[A-HJ-NP-Z2-9]{6}$/.test(id);
}

/** SHA-256 hex. Web Crypto tersedia di Node, Workers, dan browser. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
