import { sha256Hex } from "../orders/id";

/**
 * Sesi admin: satu pemilik, login dengan password dari pengaturan server.
 * Token sesi = "<kedaluwarsa ms>.<HMAC-SHA256>" yang disimpan di cookie httpOnly.
 * Tidak ada data sesi di database; mengganti ADMIN_SESSION_SECRET mengeluarkan semua sesi.
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Perbandingan yang waktunya tidak bergantung pada isi. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(secret: string, now: Date, ttlMs: number = SESSION_TTL_MS): Promise<string> {
  const expires = now.getTime() + ttlMs;
  return `${expires}.${await hmacHex(secret, `admin.v1.${expires}`)}`;
}

export async function verifySessionToken(secret: string, token: string | null | undefined, now: Date): Promise<boolean> {
  const match = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(token ?? "");
  if (!match) return false;
  const expires = Number(match[1]);
  const expected = await hmacHex(secret, `admin.v1.${expires}`);
  // Cek tanda tangan dulu, baru masa berlaku, supaya waktunya sama untuk token salah/kedaluwarsa.
  const signed = constantTimeEqual(expected, match[2]);
  return signed && expires > now.getTime();
}

/** Password dibandingkan lewat hash-nya supaya panjang password tidak ikut bocor lewat waktu. */
export async function passwordMatches(expected: string, provided: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(`admin-password:${expected}`), sha256Hex(`admin-password:${provided}`)]);
  return constantTimeEqual(a, b);
}
