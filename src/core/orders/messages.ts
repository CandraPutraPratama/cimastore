import { formatRupiah } from "../money/format";
import { pickupLabel } from "./pickup";
import type { OrderRecord } from "./record";
import { nextAdminActions, STATUS_LABEL, type OrderStatus } from "./status";

/**
 * Teks pesan untuk WhatsApp (customer ke admin) dan Telegram (notifikasi admin).
 * Generik untuk semua brand: tidak ada aturan khusus per brand di sini.
 */

type Line = OrderRecord["items"][number];

function optionText(line: Line): string {
  return line.options.map((o) => o.name).join(", ");
}

function lineTitle(line: Line, quantity = line.quantity): string {
  const options = optionText(line);
  return `${quantity}x ${line.name}${options ? ` (${options})` : ""}`;
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Pesan yang dikirim customer ke admin setelah membayar. */
export function buildWhatsappMessage(order: OrderRecord, options: { trackingUrl: string; timeZone: string }): string {
  const out: string[] = [];
  out.push("*[WAJIB LAMPIRKAN FOTO BUKTI PEMBAYARAN]*");
  out.push("_Pesanan diproses setelah foto bukti bayar masuk._");
  out.push("--------------------");
  out.push(`Halo Kak, saya sudah bayar pesanan #${order.id}`);
  out.push("");
  out.push("Pantau status pesanan:");
  out.push(options.trackingUrl);
  out.push("");
  out.push(`Brand: ${order.brand.name}`);
  out.push(`Nama: ${order.customerName}`);
  out.push(`Outlet: ${order.outletLabel}`);
  out.push(`Ambil: ${pickupLabel(order.pickupMode, new Date(order.pickupAt), options.timeZone)}`);
  out.push("");
  out.push("Pesanan:");
  for (const line of order.items) {
    out.push(`- ${lineTitle(line)} - ${formatRupiah(line.unitPrice * line.quantity)}`);
    if (line.note) out.push(`  Catatan: ${line.note}`);
  }
  out.push("");
  out.push(`Harga menu: ${formatRupiah(order.subtotal)}`);
  if (order.discount > 0) out.push(`Diskon: -${formatRupiah(order.discount)}`);
  if (order.fee > 0) out.push(`Biaya jasa: ${formatRupiah(order.fee)}`);
  out.push(`Total: ${formatRupiah(order.total)}`);
  if (order.pricing.savings > 0) {
    out.push("");
    out.push(`Hemat ${formatRupiah(order.pricing.savings)} dari harga normal.`);
  }
  out.push("");
  out.push("Mohon konfirmasi pesanan saya. Terima kasih!");
  return out.join("\n");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function displayWa(wa: string): string {
  return wa.startsWith("62") ? `0${wa.slice(2)}` : wa;
}

/** Notifikasi admin (HTML Telegram). Termasuk panduan beli per transaksi dan voucher. */
export function buildTelegramMessage(order: OrderRecord, options: { timeZone: string; note?: string }): string {
  const h = escapeHtml;
  const out: string[] = [];
  out.push(`<b>${h(order.brand.name.toUpperCase())}</b> · <code>${h(order.id)}</code>`);
  out.push(`Status: <b>${h(STATUS_LABEL[order.status])}</b>`);
  out.push(`Outlet: ${h(order.outletLabel)}`);
  out.push(`Pemesan: ${h(order.customerName)} (<a href="https://wa.me/${h(order.customerWa)}">${h(displayWa(order.customerWa))}</a>)`);
  out.push(`Ambil: ${h(pickupLabel(order.pickupMode, new Date(order.pickupAt), options.timeZone))}`);
  out.push("");

  const transactions = order.pricing.transactions;
  if (transactions.length > 0) {
    out.push(transactions.length > 1 ? `<b>Cara beli: ${transactions.length} transaksi terpisah</b>` : "<b>Cara beli</b>");
    transactions.forEach((tx, i) => {
      const voucher = tx.promo ? `voucher ${h(tx.promo.name)}` : "tanpa voucher";
      out.push(`${transactions.length > 1 ? `Transaksi ${i + 1}: ` : ""}${voucher}`);
      for (const unit of tx.units) {
        const line = order.items[unit.lineIndex];
        if (!line) continue;
        out.push(`• ${h(lineTitle(line, unit.quantity))}`);
        if (line.note) out.push(`   ↳ <i>${h(line.note)}</i>`);
      }
      out.push(`   Harga ${h(formatRupiah(tx.subtotal))}${tx.discount > 0 ? `, potongan ${h(formatRupiah(tx.discount))}` : ""}`);
    });
    for (const p of order.pricing.itemPromos) {
      const line = order.items[p.lineIndex];
      if (line) out.push(`Promo item: ${h(p.promoName)} untuk ${p.quantity}x ${h(line.name)}`);
    }
  }

  out.push("");
  out.push(`Harga menu: ${h(formatRupiah(order.subtotal))}`);
  if (order.discount > 0) out.push(`Diskon: -${h(formatRupiah(order.discount))}`);
  out.push(`Biaya jasa: ${h(formatRupiah(order.fee))}`);
  out.push(`<b>Dibayar customer: ${h(formatRupiah(order.total))}</b>`);
  if (order.status === "dibatalkan" && order.cancellationReason) out.push(`Alasan batal: ${h(order.cancellationReason)}`);
  if (order.needsRefund) out.push("<b>Perlu refund ke customer.</b>");
  if (options.note) out.push(`\n<i>${h(options.note)}</i>`);
  return out.join("\n");
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  antrian: "Terima (antrian)",
  diproses: "Sedang dibelikan",
  selesai: "Selesai",
  dibatalkan: "Batalkan",
};

export interface TelegramButton {
  text: string;
  callback_data: string;
}

/** Tombol status di bawah notifikasi. Data tombol: "s:<status>:<id pesanan>". */
export function telegramKeyboard(order: Pick<OrderRecord, "id" | "status">): { inline_keyboard: TelegramButton[][] } {
  const buttons = nextAdminActions(order.status)
    .filter((s) => ACTION_LABEL[s])
    .map((s) => ({ text: ACTION_LABEL[s]!, callback_data: `s:${s}:${order.id}` }));
  const rows: TelegramButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return { inline_keyboard: rows };
}

export function parseTelegramCallback(data: string): { status: OrderStatus; orderId: string } | null {
  const match = /^s:([a-z_]+):([A-Z]{2,3}-[A-Z0-9]{6})$/.exec(data);
  if (!match || !(match[1] in STATUS_LABEL)) return null;
  return { status: match[1] as OrderStatus, orderId: match[2] };
}
