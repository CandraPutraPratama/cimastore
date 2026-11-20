import type { Metadata } from "next";
import { inspectQris } from "@/core/qris/qris";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { card } from "@/components/admin/styles";
import { PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getSettings } from "@/server/admin/data";
import { telegramConfig } from "@/server/telegram";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  let merchant: string | null = null;
  try {
    merchant = inspectQris(settings.qrisPayload).merchantName;
  } catch {
    merchant = null;
  }
  const telegram = telegramConfig();

  return (
    <>
      <PageTitle title="Pengaturan" />
      <section className={`${card} mb-6`}>
        <SettingsForm settings={settings} qrisMerchant={merchant} />
      </section>
      <section className={card} aria-labelledby="koneksi">
        <h2 id="koneksi" className="text-lg font-bold">
          Notifikasi Telegram
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {telegram.token && telegram.adminIds.length > 0
            ? "Bot Telegram terhubung. Pesanan yang sudah dibayar dikirim ke chat admin."
            : "Bot Telegram belum diatur. Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_ADMIN_CHAT_ID di pengaturan server; pesanan tetap bisa diproses lewat panel ini."}
        </p>
      </section>
    </>
  );
}
