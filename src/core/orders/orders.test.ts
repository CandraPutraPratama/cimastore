import { describe, expect, it } from "vitest";
import type { ServiceSchedule } from "../hours/schedule";
import { normalizeCustomerName, normalizeNote, normalizeWhatsapp, CheckoutRequestSchema } from "./checkout";
import { generateAccessToken, generateOrderId, isWellFormedOrderId, isWellFormedToken, sha256Hex } from "./id";
import { buildTelegramMessage, buildWhatsappMessage, parseTelegramCallback, telegramKeyboard, whatsappLink } from "./messages";
import { pickupLabel, pickupOptions, resolvePickup } from "./pickup";
import { OrderRecordSchema, toPublicOrder, type OrderRecord } from "./record";
import { allowedSources, canTransition, needsRefundOnCancel, nextAdminActions } from "./status";

const SCHEDULE: ServiceSchedule = {
  openDays: [5, 6, 0],
  tentativeDays: [2],
  openTime: "08:00",
  closeTime: "23:20",
  timeZone: "Asia/Jakarta",
  emergencyClosed: false,
};
// Sabtu 21 Nov 2026, jam WIB.
const at = (hhmm: string) => new Date(`2026-11-21T${hhmm}:00+07:00`);

describe("status pesanan", () => {
  it("customer hanya bisa mengonfirmasi bayar; sistem hanya mengedaluwarsakan", () => {
    expect(canTransition("customer", "menunggu_pembayaran", "antrian")).toBe(true);
    expect(canTransition("customer", "antrian", "selesai")).toBe(false);
    expect(canTransition("system", "menunggu_pembayaran", "kedaluwarsa")).toBe(true);
    expect(canTransition("system", "antrian", "kedaluwarsa")).toBe(false);
  });

  it("admin: status akhir terkunci kecuali kedaluwarsa yang ternyata sudah dibayar", () => {
    expect(canTransition("admin", "selesai", "dibatalkan")).toBe(false);
    expect(canTransition("admin", "dibatalkan", "antrian")).toBe(false);
    expect(canTransition("admin", "kedaluwarsa", "antrian")).toBe(true);
    expect(allowedSources("admin", "selesai").sort()).toEqual(["antrian", "diproses"]);
    expect(nextAdminActions("antrian")).toEqual(["diproses", "selesai", "dibatalkan"]);
    expect(nextAdminActions("selesai")).toEqual([]);
  });

  it("batal setelah bayar ditandai perlu refund", () => {
    expect(needsRefundOnCancel("antrian")).toBe(true);
    expect(needsRefundOnCancel("menunggu_pembayaran")).toBe(false);
  });
});

describe("ID dan token", () => {
  it("format ID dan token", async () => {
    const id = generateOrderId("KK", () => new Uint8Array([0, 1, 31, 32, 255, 100]));
    expect(id).toBe("KK-AB9A9E");
    expect(isWellFormedOrderId(id)).toBe(true);
    expect(isWellFormedOrderId(generateOrderId("FR"))).toBe(true);
    expect(() => generateOrderId("kk")).toThrow();
    const token = generateAccessToken();
    expect(isWellFormedToken(token)).toBe(true);
    expect(generateAccessToken()).not.toBe(token);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("jam ambil", () => {
  const mall = { open: "10:00", close: "21:45" };

  it("buka: bisa sekarang, slot 15 menit mulai 10 menit dari sekarang sampai jam tutup paling awal", () => {
    const o = pickupOptions(SCHEDULE, mall, at("14:07"));
    expect(o.canOrder).toBe(true);
    expect(o.nowAvailable).toBe(true);
    expect(o.slots[0]).toBe("14:30");
    expect(o.slots.at(-1)).toBe("21:45");
  });

  it("pagi sebelum outlet buka: hanya jadwal mulai jam buka outlet", () => {
    const o = pickupOptions(SCHEDULE, mall, at("08:30"));
    expect(o.nowAvailable).toBe(false);
    expect(o.slots[0]).toBe("10:00");
    const r = resolvePickup({ mode: "now" }, SCHEDULE, mall, at("08:30"));
    expect(r.ok).toBe(false);
  });

  it("jasdor tutup atau outlet sudah tutup: tidak bisa pesan", () => {
    expect(pickupOptions(SCHEDULE, mall, new Date("2026-11-23T12:00:00+07:00")).canOrder).toBe(false); // Senin
    const late = pickupOptions(SCHEDULE, mall, at("21:40"));
    expect(late.canOrder).toBe(false);
    expect(late.reason).toMatch(/Outlet/);
  });

  it("outlet tutup lewat tengah malam dibatasi jam tutup jasdor", () => {
    const o = pickupOptions(SCHEDULE, { open: "10:00", close: "02:00" }, at("22:50"));
    expect(o.slots).toEqual(["23:00", "23:15"]);
  });

  it("waktu ambil dihitung di zona WIB", () => {
    const now = at("14:07");
    const scheduled = resolvePickup({ mode: "scheduled", time: "15:00" }, SCHEDULE, mall, now);
    expect(scheduled.ok && scheduled.pickupAt.toISOString()).toBe("2026-11-21T08:00:00.000Z");
    const soon = resolvePickup({ mode: "now" }, SCHEDULE, mall, now);
    expect(soon.ok && pickupLabel("now", soon.pickupAt, "Asia/Jakarta")).toBe("Sekarang (siap sekitar 14.17)");
    expect(resolvePickup({ mode: "scheduled", time: "14:15" }, SCHEDULE, mall, now).ok).toBe(false);
  });
});

describe("data checkout", () => {
  it("nomor WhatsApp dinormalkan ke 62", () => {
    expect(normalizeWhatsapp("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsapp("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsapp("81234567890")).toBe("6281234567890");
    expect(normalizeWhatsapp("021-5551234")).toBeNull();
    expect(normalizeWhatsapp("0812")).toBeNull();
  });

  it("nama dan catatan dibersihkan dari baris baru dan karakter kontrol", () => {
    expect(normalizeCustomerName("  Budi\nTotal: Rp0  ")).toBe("Budi Total: Rp0");
    expect(normalizeCustomerName("123 !!!")).toBeNull();
    expect(normalizeCustomerName("x".repeat(100))).toHaveLength(60);
    expect(normalizeNote("less\u202Eice\r\n")).toBe("less ice");
    expect(normalizeNote("   ")).toBeUndefined();
  });

  it("skema menolak keranjang kosong dan jumlah tidak wajar", () => {
    const base = { brand: "kopi-kenangan", outlet: "X", customer: { name: "A", whatsapp: "0812" }, pickup: { mode: "now" }, expectedTotal: 0 };
    expect(CheckoutRequestSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(CheckoutRequestSchema.safeParse({ ...base, items: [{ productId: "1", optionIds: [], quantity: 0 }] }).success).toBe(false);
    expect(CheckoutRequestSchema.safeParse({ ...base, items: [{ productId: "1", optionIds: [], quantity: 2 }] }).success).toBe(true);
  });
});

const ORDER: OrderRecord = OrderRecordSchema.parse({
  id: "KK-AB2CDE",
  status: "antrian",
  brand: { slug: "kopi-kenangan", name: "Kopi Kenangan" },
  outletCode: "LIPPO-PURI",
  outletLabel: "Lippo Mall Puri",
  customerName: "Budi <b>",
  customerWa: "6281234567890",
  pickupMode: "now",
  pickupAt: "2026-11-21T07:17:00.000Z",
  items: [
    {
      productId: "1",
      name: "Kopi Kenangan Mantan",
      quantity: 2,
      basePrice: 22000,
      optionsPrice: 5000,
      unitPrice: 27000,
      compareAtUnitPrice: 28000,
      options: [
        { id: "a", groupName: "Suhu", name: "Ice", priceDelta: 0 },
        { id: "b", groupName: "Ukuran", name: "Large", priceDelta: 5000 },
      ],
      note: "less sugar",
    },
    { productId: "2", name: "Chocolate Croissant", quantity: 1, basePrice: 19000, optionsPrice: 0, unitPrice: 19000, compareAtUnitPrice: 19000, options: [] },
  ],
  pricing: {
    itemCount: 3,
    itemDiscount: 0,
    transactionDiscount: 31500,
    compareAtTotal: 75000,
    savings: 18600,
    transactions: [
      { units: [{ lineIndex: 0, quantity: 2 }], promo: { id: "kk-30", name: "Diskon 50% (maks Rp30.000, min Rp50.000)" }, subtotal: 54000, discount: 22000, total: 32000 },
      { units: [{ lineIndex: 1, quantity: 1 }], promo: { id: "kk-35", name: "Diskon 50% (maks Rp35.000)" }, subtotal: 19000, discount: 9500, total: 9500 },
    ],
    itemPromos: [],
    splitMethod: "exact",
  },
  subtotal: 73000,
  discount: 31500,
  fee: 6900,
  total: 48400,
  needsRefund: false,
  expiresAt: "2026-11-21T08:07:00.000Z",
  createdAt: "2026-11-21T07:07:00.000Z",
  telegram: { chatId: "123", messageId: 9 },
});

describe("pesan WhatsApp dan Telegram", () => {
  it("WhatsApp memuat link pantau, rincian, dan hemat", () => {
    const text = buildWhatsappMessage(ORDER, { trackingUrl: "https://x.test/pesanan/KK-AB2CDE?t=abc", timeZone: "Asia/Jakarta" });
    expect(text).toContain("saya sudah bayar pesanan #KK-AB2CDE");
    expect(text).toContain("https://x.test/pesanan/KK-AB2CDE?t=abc");
    expect(text).toContain("- 2x Kopi Kenangan Mantan (Ice, Large) - Rp54.000\n  Catatan: less sugar");
    expect(text).toContain("Ambil: Sekarang (siap sekitar 14.17)");
    expect(text).toContain("Diskon: -Rp31.500\nBiaya jasa: Rp6.900\nTotal: Rp48.400");
    expect(text).toContain("Hemat Rp18.600");
    expect(whatsappLink("6287793420768", "a b&c")).toBe("https://wa.me/6287793420768?text=a%20b%26c");
  });

  it("Telegram: panduan beli per transaksi, input customer di-escape", () => {
    const html = buildTelegramMessage(ORDER, { timeZone: "Asia/Jakarta" });
    expect(html).toContain("Budi &lt;b&gt;");
    expect(html).toContain("<b>Cara beli: 2 transaksi terpisah</b>");
    expect(html).toContain("Transaksi 1: voucher Diskon 50% (maks Rp30.000, min Rp50.000)\n• 2x Kopi Kenangan Mantan (Ice, Large)");
    expect(html).toContain("Transaksi 2: voucher Diskon 50% (maks Rp35.000)\n• 1x Chocolate Croissant");
    expect(html).toContain("<b>Dibayar customer: Rp48.400</b>");
  });

  it("tombol Telegram mengikuti status dan datanya bisa dibaca balik", () => {
    const kb = telegramKeyboard(ORDER);
    expect(kb.inline_keyboard.flat().map((b) => b.callback_data)).toEqual(["s:diproses:KK-AB2CDE", "s:selesai:KK-AB2CDE", "s:dibatalkan:KK-AB2CDE"]);
    expect(parseTelegramCallback("s:selesai:KK-AB2CDE")).toEqual({ status: "selesai", orderId: "KK-AB2CDE" });
    expect(parseTelegramCallback("s:hacked:KK-AB2CDE")).toBeNull();
    expect(parseTelegramCallback("s:selesai:KK-AB2CDE;drop")).toBeNull();
  });

  it("data publik tidak membawa info Telegram", () => {
    expect("telegram" in toPublicOrder(ORDER)).toBe(false);
  });
});
