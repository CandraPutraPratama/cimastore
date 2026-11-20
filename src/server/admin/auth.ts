import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  MIN_PASSWORD_LENGTH,
  MIN_SECRET_LENGTH,
  SESSION_TTL_MS,
  createSessionToken,
  passwordMatches,
  verifySessionToken,
} from "@/core/admin/session";
import { rpc } from "../db/rpc";
import { env } from "../config";

/**
 * Login admin (satu pemilik).
 * ADMIN_PASSWORD        password login, minimal 12 karakter.
 * ADMIN_SESSION_SECRET  kunci penanda sesi, acak minimal 32 karakter. Menggantinya mengeluarkan semua sesi.
 * Keduanya diisi di .env.local (laptop) atau secret Cloudflare (produksi); jangan pernah ditulis di chat atau kode.
 */

export type AdminConfig = { ok: true; password: string; secret: string } | { ok: false; problem: string };

export function adminConfig(): AdminConfig {
  const password = env("ADMIN_PASSWORD");
  const secret = env("ADMIN_SESSION_SECRET");
  if (!password || !secret) return { ok: false, problem: "Admin belum diaktifkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET di pengaturan server." };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, problem: `ADMIN_PASSWORD terlalu pendek (minimal ${MIN_PASSWORD_LENGTH} karakter).` };
  if (secret.length < MIN_SECRET_LENGTH) return { ok: false, problem: `ADMIN_SESSION_SECRET terlalu pendek (minimal ${MIN_SECRET_LENGTH} karakter).` };
  return { ok: true, password, secret };
}

// Awalan __Host- hanya boleh dipakai bersama Secure, yang tidak ada di http://localhost.
const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-jasdor_admin" : "jasdor_admin";

export async function isAdmin(): Promise<boolean> {
  const config = adminConfig();
  if (!config.ok) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return verifySessionToken(config.secret, token, new Date());
}

/** Dipanggil di setiap halaman dan setiap aksi admin: layout saja tidak cukup sebagai penjaga. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

export type LoginResult = { ok: true } | { ok: false; message: string };

const FAILURE_DELAY_MS = 800;
const MAX_FAILS = 5;

type Gate = { locked: boolean; retryAfter: number };

/** Kunci pembatas: sidik jari alamat IP, bukan IP-nya sendiri. */
async function attemptKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tanpa-ip";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`login:${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function gate(key: string, event: "check" | "fail" | "ok"): Promise<Gate> {
  const data = await rpc<Gate>("admin_login_gate", { p_key: key, p_event: event, p_max: MAX_FAILS });
  return { locked: data?.locked === true, retryAfter: data?.retryAfter ?? 0 };
}

function lockedMessage(retryAfter: number): string {
  return `Terlalu banyak percobaan. Coba lagi ${Math.max(1, Math.ceil(retryAfter / 60))} menit lagi.`;
}

export async function loginWithPassword(password: string): Promise<LoginResult> {
  const config = adminConfig();
  if (!config.ok) return { ok: false, message: config.problem };
  // Gagal tertutup: kalau pembatas tidak bisa dicek, login ditolak daripada dibiarkan tanpa batas.
  let key: string;
  try {
    key = await attemptKey();
    const state = await gate(key, "check");
    if (state.locked) return { ok: false, message: lockedMessage(state.retryAfter) };
  } catch {
    return { ok: false, message: "Login sedang tidak bisa dicek. Coba lagi sebentar." };
  }
  if (!(await passwordMatches(config.password, password.slice(0, 200)))) {
    // Jeda kecil memperlambat tebak-tebakan; batas percobaan per alamat ada di admin_login_gate.
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    try {
      const state = await gate(key, "fail");
      if (state.locked) return { ok: false, message: lockedMessage(state.retryAfter) };
    } catch {
      /* hitungan gagal tercatat; pesan salah tetap ditampilkan */
    }
    return { ok: false, message: "Password salah." };
  }
  await gate(key, "ok").catch(() => undefined);
  const token = await createSessionToken(config.secret, new Date());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
