import type { OrderStatus } from "@/core/orders/status";

const TZ = "Asia/Jakarta";

export function formatDateTime(iso: string, timeZone: string = TZ): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function displayWa(wa: string): string {
  return wa.startsWith("62") ? `0${wa.slice(2)}` : wa;
}

export const STATUS_STYLE: Record<OrderStatus, string> = {
  menunggu_pembayaran: "bg-mist text-ink-soft",
  menunggu_konfirmasi: "bg-marigold/25 text-ink",
  antrian: "bg-marigold/30 text-ink",
  diproses: "bg-ink text-paper",
  selesai: "bg-hemat-soft text-hemat",
  dibatalkan: "bg-danger/10 text-danger",
  kedaluwarsa: "bg-mist text-ink-faint",
};

/** Pesan singkat setelah sebuah aksi, dipilih lewat kode di URL (?info=...). Kode tak dikenal diabaikan. */
export const FLASH: Record<string, { text: string; tone: "ok" | "warn" }> = {
  status: { text: "Status pesanan diperbarui.", tone: "ok" },
  ditolak: { text: "Status tidak bisa diubah ke sana karena pesanan sudah berubah. Cek status terbaru di bawah.", tone: "warn" },
  "tidak-ada": { text: "Pesanan tidak ditemukan.", tone: "warn" },
  refund: { text: "Refund ditandai sudah dikirim.", tone: "ok" },
  aktif: { text: "Brand diaktifkan. Customer sudah bisa memesan.", tone: "ok" },
  nonaktif: { text: "Brand dinonaktifkan. Brand hilang dari beranda customer.", tone: "ok" },
  "promo-disimpan": { text: "Promo disimpan.", tone: "ok" },
  "promo-aktif": { text: "Promo diaktifkan.", tone: "ok" },
  "promo-nonaktif": { text: "Promo dinonaktifkan.", tone: "ok" },
  "promo-dihapus": { text: "Promo dihapus.", tone: "ok" },
  "brand-dibuat": { text: "Brand dibuat dan masih nonaktif. Isi menu dan outletnya (impor CSV atau tambah produk), atur biaya jasa, lalu aktifkan.", tone: "ok" },
  "produk-disimpan": { text: "Produk disimpan.", tone: "ok" },
};
