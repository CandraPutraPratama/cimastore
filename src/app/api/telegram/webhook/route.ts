import { parseTelegramCallback } from "@/core/orders/messages";
import { STATUS_LABEL } from "@/core/orders/status";
import { safeEqual } from "@/server/config";
import { transitionOrder } from "@/server/orders";
import { syncTelegram, telegramApi, telegramConfig } from "@/server/telegram";

/**
 * Webhook bot Telegram admin: tombol status di bawah notifikasi pesanan.
 * Ditolak tanpa header secret yang cocok (isi body bisa dipalsukan siapa saja),
 * lalu hanya chat/user yang ada di TELEGRAM_ADMIN_CHAT_ID yang boleh mengubah status.
 */

interface TelegramUpdate {
  callback_query?: {
    id: string;
    from?: { id?: number; username?: string; first_name?: string };
    message?: { message_id?: number; chat?: { id?: number } };
    data?: string;
  };
  message?: { message_id?: number; text?: string; from?: { id?: number }; chat?: { id?: number } };
}

const ok = () => Response.json({ ok: true });

async function quietly(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    console.error("[telegram.webhook]", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  const { webhookSecret, adminIds } = telegramConfig();
  const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!webhookSecret || !safeEqual(webhookSecret, provided)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return ok();
  const isAdmin = (...ids: Array<number | undefined>) => ids.some((id) => id !== undefined && adminIds.includes(String(id)));

  const cb = update.callback_query;
  if (cb) {
    if (!isAdmin(cb.from?.id, cb.message?.chat?.id)) {
      await quietly(telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Akses ditolak.", show_alert: true }));
      return ok();
    }
    const action = parseTelegramCallback(cb.data ?? "");
    if (!action) {
      await quietly(telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Tombol tidak dikenal." }));
      return ok();
    }
    const who = cb.from?.username ? `@${cb.from.username}` : (cb.from?.first_name ?? String(cb.from?.id ?? "admin"));
    try {
      const result = await transitionOrder({
        id: action.orderId,
        to: action.status,
        actor: "admin",
        actorLabel: `telegram:${who}`,
        note: "Lewat tombol Telegram",
        ...(action.status === "dibatalkan" ? { cancellationReason: "Dibatalkan admin" } : {}),
      });
      if (!result) {
        await quietly(telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Pesanan tidak ditemukan.", show_alert: true }));
        return ok();
      }
      const label = STATUS_LABEL[result.order.status];
      const answer =
        result.kind === "rejected"
          ? `Tidak bisa: pesanan sudah ${label.toLowerCase()}.`
          : `${action.orderId}: ${label}`;
      await quietly(telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: answer, show_alert: result.kind === "rejected" }));
      await syncTelegram(result.order, result.kind === "changed" ? `${label} oleh ${who}` : undefined);
    } catch (error) {
      console.error("[telegram.webhook]", error);
      await quietly(telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Gagal mengubah status. Coba lagi.", show_alert: true }));
    }
    return ok();
  }

  const message = update.message;
  if (message?.chat?.id !== undefined) {
    if (message.text?.trim() === "/start") {
      const text = isAdmin(message.from?.id, message.chat.id)
        ? "Bot ini mengirim pesanan Jasdor yang sudah dibayar. Ubah status lewat tombol di bawah tiap pesanan."
        : `Bot ini khusus admin Jasdor. Chat ID kamu: ${message.chat.id}`;
      await quietly(telegramApi("sendMessage", { chat_id: message.chat.id, text }));
    } else if (message.message_id !== undefined && isAdmin(message.chat.id)) {
      // Ketikan di chat admin dihapus supaya isi chat hanya daftar pesanan.
      await quietly(telegramApi("deleteMessage", { chat_id: message.chat.id, message_id: message.message_id }));
    }
  }
  return ok();
}
