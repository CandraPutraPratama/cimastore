import { CheckoutRequestSchema, normalizeCustomerName, normalizeNote, normalizeWhatsapp } from "@/core/orders/checkout";
import { priceCart } from "@/core/orders/cart";
import { generateAccessToken, generateOrderId, isWellFormedOrderId, isWellFormedToken, sha256Hex } from "@/core/orders/id";
import { buildWhatsappMessage, whatsappLink } from "@/core/orders/messages";
import { resolvePickup } from "@/core/orders/pickup";
import { OrderRecordSchema, type OrderRecord } from "@/core/orders/record";
import { canTransition, needsRefundOnCancel, type OrderActor, type OrderStatus } from "@/core/orders/status";
import { inspectQris, qrisWithAmount } from "@/core/qris/qris";
import { getMenu } from "./catalog";
import { getSiteSettings, siteUrl } from "./config";
import { rpc } from "./db/rpc";
import { syncTelegram } from "./telegram";

/** Kesalahan yang aman ditampilkan ke customer. */
export class OrderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface CreatedOrder {
  id: string;
  token: string;
  /** Link halaman pesanan (berisi token). */
  path: string;
}

/**
 * Membuat pesanan dari keranjang customer. Semua harga dihitung ulang di server dari menu
 * terbaru; angka dari browser hanya dipakai untuk mendeteksi perubahan harga.
 */
export async function createOrder(input: unknown, now: Date = new Date()): Promise<CreatedOrder> {
  const parsed = CheckoutRequestSchema.safeParse(input);
  if (!parsed.success) throw new OrderError(400, "INVALID_REQUEST", "Data pesanan tidak lengkap.");
  const req = parsed.data;

  const customerName = normalizeCustomerName(req.customer.name);
  if (!customerName) throw new OrderError(400, "INVALID_NAME", "Isi nama pemesan.");
  const customerWa = normalizeWhatsapp(req.customer.whatsapp);
  if (!customerWa) throw new OrderError(400, "INVALID_WHATSAPP", "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.");

  const [settings, menu] = await Promise.all([getSiteSettings(), getMenu(req.brand, req.outlet)]);
  if (!menu) throw new OrderError(404, "OUTLET_NOT_FOUND", "Outlet tidak ditemukan atau sedang tidak melayani.");

  const pickup = resolvePickup(req.pickup, settings, { open: menu.outlet.openTime, close: menu.outlet.closeTime }, now);
  if (!pickup.ok) throw new OrderError(409, "PICKUP_UNAVAILABLE", pickup.message);

  const cart = priceCart(
    menu,
    req.items.map((i) => ({ productId: i.productId, optionIds: i.optionIds, quantity: i.quantity, note: normalizeNote(i.note) })),
    now,
  );
  if (cart.hasProblems) {
    const problems = cart.results.flatMap((r) => (r.ok ? [] : [{ productId: r.productId, name: r.name, message: r.message }]));
    throw new OrderError(409, "CART_CHANGED", "Ada menu di keranjang yang berubah. Cek lagi keranjangmu.", problems);
  }
  const order = cart.order;
  if (order.itemCount > menu.brand.maxItemsPerOrder) {
    throw new OrderError(400, "TOO_MANY_ITEMS", `Maksimal ${menu.brand.maxItemsPerOrder} item per pesanan.`);
  }
  if (order.total !== req.expectedTotal) {
    throw new OrderError(409, "PRICE_CHANGED", "Harga atau promo baru saja berubah. Cek total terbaru sebelum lanjut.", { total: order.total });
  }

  try {
    inspectQris(settings.qrisPayload);
  } catch {
    throw new OrderError(503, "PAYMENT_NOT_READY", "Pembayaran sedang disiapkan. Coba lagi sebentar lagi.");
  }

  const token = generateAccessToken();
  const accessTokenHash = await sha256Hex(token);
  const { lines: _lines, hint: _hint, subtotal, discount, fee, total, ...pricing } = order;
  void _lines;
  void _hint;

  for (let attempt = 0; attempt < 4; attempt++) {
    const idSuffix = generateOrderId("XX").slice(3);
    const result = await rpc<{ ok: boolean; error?: string; order?: unknown }>("order_create", {
      p_order: {
        brandSlug: menu.brand.slug,
        outletCode: menu.outlet.code,
        outletLabel: menu.outlet.name,
        customerName,
        customerWa,
        pickupMode: pickup.mode,
        pickupAt: pickup.pickupAt.toISOString(),
        items: order.lines,
        pricing,
        subtotal,
        discount,
        fee,
        total,
        accessTokenHash,
        expiresAt: new Date(now.getTime() + settings.paymentExpiryMinutes * 60_000).toISOString(),
        idSuffix,
      },
    });
    if (result?.ok && result.order) {
      const created = OrderRecordSchema.parse(result.order);
      return { id: created.id, token, path: orderPath(created.id, token) };
    }
    if (result?.error === "ID_TAKEN") continue;
    if (result?.error === "TOO_MANY_PENDING") {
      throw new OrderError(429, "TOO_MANY_PENDING", "Masih ada pesananmu yang belum dibayar. Selesaikan atau tunggu sampai kedaluwarsa dulu.");
    }
    throw new OrderError(500, result?.error ?? "CREATE_FAILED", "Pesanan gagal dibuat. Coba lagi.");
  }
  throw new OrderError(500, "CREATE_FAILED", "Pesanan gagal dibuat. Coba lagi.");
}

export function orderPath(id: string, token: string): string {
  return `/pesanan/${id}?t=${encodeURIComponent(token)}`;
}

async function tokenHash(id: string, token: string | null | undefined): Promise<string | null> {
  if (!isWellFormedOrderId(id) || !token || !isWellFormedToken(token)) return null;
  return sha256Hex(token);
}

/** Pesanan milik customer (token wajib cocok). null = tidak ada atau token salah. */
export async function getOrderForCustomer(id: string, token: string | null | undefined): Promise<OrderRecord | null> {
  const hash = await tokenHash(id, token);
  if (!hash) return null;
  const data = await rpc("order_get", { p_id: id, p_token_hash: hash });
  return data ? OrderRecordSchema.parse(data) : null;
}

/** Hanya untuk jalur admin/Telegram yang sudah diautentikasi. */
export async function getOrderForAdmin(id: string): Promise<OrderRecord | null> {
  if (!isWellFormedOrderId(id)) return null;
  const data = await rpc("order_get", { p_id: id });
  return data ? OrderRecordSchema.parse(data) : null;
}

export type TransitionResult =
  | { kind: "changed"; order: OrderRecord; from: OrderStatus }
  | { kind: "unchanged"; order: OrderRecord }
  | { kind: "rejected"; order: OrderRecord };

/**
 * Mengubah status sesuai aturan di src/core/orders/status.ts. Database memastikan perubahan
 * hanya terjadi bila status belum diubah orang lain sejak dibaca.
 */
export async function transitionOrder(params: {
  id: string;
  to: OrderStatus;
  actor: OrderActor;
  actorLabel: string;
  token?: string | null;
  note?: string;
  cancellationReason?: string;
}): Promise<TransitionResult | null> {
  const hash = params.actor === "customer" ? await tokenHash(params.id, params.token) : null;
  if (params.actor === "customer" && !hash) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = hash ? await getOrderForCustomer(params.id, params.token) : await getOrderForAdmin(params.id);
    if (!current) return null;
    if (current.status === params.to) return { kind: "unchanged", order: current };
    if (!canTransition(params.actor, current.status, params.to)) return { kind: "rejected", order: current };

    const result = await rpc<{ changed: boolean; conflict: boolean; from: OrderStatus; order: unknown }>("order_transition", {
      p_id: params.id,
      p_to: params.to,
      p_from: [current.status],
      p_actor: params.actorLabel,
      p_note: params.note ?? null,
      p_token_hash: hash,
      p_cancellation_reason: params.to === "dibatalkan" ? (params.cancellationReason ?? null) : null,
      p_needs_refund: params.to === "dibatalkan" ? needsRefundOnCancel(current.status) : null,
    });
    if (!result) return null;
    const order = OrderRecordSchema.parse(result.order);
    if (result.changed) return { kind: "changed", order, from: result.from };
    if (!result.conflict) return { kind: "unchanged", order };
    // Status berubah di antara baca dan tulis: ulangi dengan status terbaru.
  }
  const latest = await getOrderForAdmin(params.id);
  return latest ? { kind: "rejected", order: latest } : null;
}

/** Customer menekan "Saya sudah bayar": pesanan masuk antrian dan admin diberi tahu. */
export async function confirmPayment(id: string, token: string | null | undefined): Promise<OrderRecord> {
  const result = await transitionOrder({ id, token, to: "antrian", actor: "customer", actorLabel: "customer", note: "Customer menekan Saya sudah bayar" });
  if (!result) throw new OrderError(404, "NOT_FOUND", "Pesanan tidak ditemukan.");
  if (result.kind === "rejected") {
    if (result.order.status === "kedaluwarsa") {
      throw new OrderError(409, "EXPIRED", "Batas waktu bayar sudah habis. Kalau kamu sudah terlanjur bayar, hubungi admin lewat WhatsApp.");
    }
    if (result.order.status === "dibatalkan") throw new OrderError(409, "CANCELLED", "Pesanan ini sudah dibatalkan.");
    return result.order;
  }
  if (result.kind === "changed") await syncTelegram(result.order);
  return result.order;
}

export interface PaymentView {
  /** QRIS dengan nominal terisi, atau null bila payload QRIS rusak. */
  qris: string | null;
  merchantName?: string;
  nmid?: string;
  whatsappUrl: string;
  adminWhatsapp: string;
  timeZone: string;
}

/** Data pendukung halaman pesanan: QRIS bernominal dan link WhatsApp ke admin. */
export async function paymentView(order: OrderRecord, token: string, requestUrl?: string): Promise<PaymentView> {
  const settings = await getSiteSettings();
  let qris: string | null = null;
  let info: { merchantName?: string; nmid?: string } = {};
  try {
    info = inspectQris(settings.qrisPayload);
    qris = qrisWithAmount(settings.qrisPayload, order.total);
  } catch {
    qris = null;
  }
  const trackingUrl = `${siteUrl(requestUrl)}${orderPath(order.id, token)}`;
  const message = buildWhatsappMessage(order, { trackingUrl, timeZone: settings.timeZone });
  return {
    qris,
    ...(info.merchantName ? { merchantName: info.merchantName } : {}),
    ...(info.nmid ? { nmid: info.nmid } : {}),
    whatsappUrl: whatsappLink(settings.whatsappNumber, message),
    adminWhatsapp: settings.whatsappNumber,
    timeZone: settings.timeZone,
  };
}

/** Untuk cron: kedaluwarsakan semua pesanan belum dibayar yang lewat batas. */
export async function expireDueOrders(): Promise<number> {
  return (await rpc<number>("order_expire_due", { p_id: null, p_limit: 500 })) ?? 0;
}
