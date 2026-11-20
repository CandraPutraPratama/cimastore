/**
 * Memasang webhook bot Telegram ke website (jalankan setelah website online di SITE_URL):
 *   npm run telegram:webhook          pasang webhook
 *   npm run telegram:webhook -- info  lihat status bot & webhook
 * Membaca TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SITE_URL dari .env.local.
 */
import { loadEnvFiles } from "./lib/env";

loadEnvFiles();
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const site = process.env.SITE_URL?.trim();

async function call(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

async function main() {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diisi di .env.local.");
  const me = (await call("getMe")) as { username: string };
  console.log(`Bot: @${me.username}`);

  const wantInfo = process.argv.includes("info") || process.env.npm_config_info === "true";
  if (!wantInfo) {
    if (!secret || secret.length < 20) throw new Error("TELEGRAM_WEBHOOK_SECRET belum diisi (minimal 20 karakter, huruf/angka).");
    if (!/^[A-Za-z0-9_-]+$/.test(secret)) throw new Error("TELEGRAM_WEBHOOK_SECRET hanya boleh huruf, angka, _ dan -.");
    if (!site?.startsWith("https://")) throw new Error("SITE_URL harus alamat https website yang sudah online.");
    const url = `${new URL(site).origin}/api/telegram/webhook`;
    await call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    console.log(`Webhook dipasang: ${url}`);
  }
  const info = (await call("getWebhookInfo")) as { url: string; pending_update_count: number; last_error_message?: string };
  console.log(`Webhook sekarang: ${info.url || "(belum ada)"}, antrean ${info.pending_update_count}${info.last_error_message ? `, error terakhir: ${info.last_error_message}` : ""}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
