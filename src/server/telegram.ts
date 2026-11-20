import { buildTelegramMessage, telegramKeyboard } from "@/core/orders/messages";
import type { OrderRecord } from "@/core/orders/record";
import { env } from "./config";
import { rpc } from "./db/rpc";

/**
 * Notifikasi admin lewat bot Telegram.
 * TELEGRAM_BOT_TOKEN       token bot (dari @BotFather). Pakai bot khusus v2: satu bot hanya bisa punya satu webhook.
 * TELEGRAM_ADMIN_CHAT_ID   daftar chat/user ID admin dipisah koma. ID pertama = tujuan notifikasi.
 * TELEGRAM_WEBHOOK_SECRET  secret yang dipasang saat setWebhook.
 * Tanpa token/chat ID, notifikasi dilewati (pesanan tetap jalan).
 */

export function telegramConfig() {
  const adminIds = (env("TELEGRAM_ADMIN_CHAT_ID") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { token: env("TELEGRAM_BOT_TOKEN"), adminIds, webhookSecret: env("TELEGRAM_WEBHOOK_SECRET") };
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const { token } = telegramConfig();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diisi.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(`Telegram ${method}: ${data?.description ?? res.status}`);
  return data.result as T;
}

function timeZone(): string {
  return env("TIME_ZONE") ?? "Asia/Jakarta";
}

/**
 * Menyamakan pesan Telegram dengan status pesanan terbaru: kirim baru bila belum ada,
 * selain itu edit pesan lama. Gagal kirim tidak menggagalkan pesanan (hanya dicatat).
 */
export async function syncTelegram(order: OrderRecord, note?: string): Promise<void> {
  const { token, adminIds } = telegramConfig();
  if (!token || adminIds.length === 0) return;
  const text = buildTelegramMessage(order, { timeZone: timeZone(), ...(note ? { note } : {}) });
  const reply_markup = telegramKeyboard(order);
  try {
    if (order.telegram) {
      await telegramApi("editMessageText", {
        chat_id: order.telegram.chatId,
        message_id: order.telegram.messageId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup,
      });
      return;
    }
    const sent = await telegramApi<{ message_id: number; chat: { id: number } }>("sendMessage", {
      chat_id: adminIds[0],
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup,
    });
    await rpc("order_set_telegram", { p_id: order.id, p_chat_id: String(sent.chat.id), p_message_id: sent.message_id });
  } catch (error) {
    // "message is not modified" = isi sama, bukan masalah.
    if (error instanceof Error && error.message.includes("not modified")) return;
    console.error(`[telegram] ${order.id}:`, error instanceof Error ? error.message : error);
  }
}
