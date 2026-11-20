import { rpc } from "./db/rpc";
import { SiteSettingsSchema, type SiteSettings } from "@/core/catalog/storefront";

/** Variabel lingkungan server. Nilai rahasia tidak pernah dikirim ke browser. */

export function env(name: string): string | undefined {
  const value = process.env[name]?.replace(/\r/g, "").trim();
  return value ? value : undefined;
}

/** Alamat publik website, untuk link di pesan WhatsApp. */
export function siteUrl(requestUrl?: string): string {
  const configured = env("SITE_URL");
  if (configured) return new URL(configured).origin;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return SiteSettingsSchema.parse((await rpc("site_settings_get", {})) ?? {});
}

/** Perbandingan string yang waktunya tidak bergantung pada isi (untuk secret). */
export function safeEqual(expected: string, provided: string): boolean {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
