/**
 * Status pesanan dan siapa boleh memindahkannya ke mana.
 *
 * Alur normal: menunggu_pembayaran -> (customer tekan "Saya sudah bayar") antrian
 * -> diproses -> selesai. Seperti v1, konfirmasi customer langsung masuk antrian supaya
 * admin tidak perlu klik dua kali; admin tetap mengecek bukti bayar di WhatsApp.
 * `menunggu_konfirmasi` disimpan untuk kasus khusus (admin menahan pesanan).
 */

export const ORDER_STATUSES = [
  "menunggu_pembayaran",
  "menunggu_konfirmasi",
  "antrian",
  "diproses",
  "selesai",
  "dibatalkan",
  "kedaluwarsa",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderActor = "customer" | "admin" | "system";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  menunggu_pembayaran: "Menunggu pembayaran",
  menunggu_konfirmasi: "Menunggu konfirmasi admin",
  antrian: "Masuk antrian",
  diproses: "Sedang dibelikan",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  kedaluwarsa: "Kedaluwarsa",
};

const FINAL: ReadonlySet<OrderStatus> = new Set(["selesai", "dibatalkan", "kedaluwarsa"]);

export function isFinalStatus(status: OrderStatus): boolean {
  return FINAL.has(status);
}

/** Status yang berarti customer sudah membayar (dipakai untuk tanda perlu refund saat batal). */
const PAID: ReadonlySet<OrderStatus> = new Set(["menunggu_konfirmasi", "antrian", "diproses"]);

const TRANSITIONS: Record<OrderActor, Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  customer: {
    menunggu_pembayaran: ["antrian"],
  },
  admin: {
    menunggu_pembayaran: ["antrian", "dibatalkan"],
    menunggu_konfirmasi: ["antrian", "diproses", "dibatalkan"],
    antrian: ["menunggu_konfirmasi", "diproses", "selesai", "dibatalkan"],
    diproses: ["selesai", "dibatalkan"],
    // Customer terlanjur bayar setelah batas waktu: admin bisa menerima pesanannya.
    kedaluwarsa: ["antrian"],
  },
  system: {
    menunggu_pembayaran: ["kedaluwarsa"],
  },
};

export function canTransition(actor: OrderActor, from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[actor][from]?.includes(to) ?? false;
}

/** Status asal yang sah untuk tujuan tertentu (dipakai sebagai syarat update di database). */
export function allowedSources(actor: OrderActor, to: OrderStatus): OrderStatus[] {
  return (Object.entries(TRANSITIONS[actor]) as Array<[OrderStatus, readonly OrderStatus[]]>)
    .filter(([, targets]) => targets.includes(to))
    .map(([from]) => from);
}

export function needsRefundOnCancel(from: OrderStatus): boolean {
  return PAID.has(from);
}

/** Tombol admin berikutnya untuk tiap status (urut sesuai alur kerja). */
export function nextAdminActions(status: OrderStatus): OrderStatus[] {
  const order: OrderStatus[] = ["antrian", "diproses", "selesai", "dibatalkan"];
  const targets = TRANSITIONS.admin[status] ?? [];
  return order.filter((s) => targets.includes(s));
}
