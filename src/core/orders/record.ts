import { z } from "zod";
import { ORDER_STATUSES } from "./status";

/** Bentuk pesanan yang dikembalikan database (fungsi order_get) dan dipakai halaman, WA, dan Telegram. */

const PricedLineSchema = z.object({
  productId: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  basePrice: z.number().int(),
  optionsPrice: z.number().int(),
  unitPrice: z.number().int(),
  compareAtUnitPrice: z.number().int(),
  options: z.array(z.object({ id: z.string(), groupName: z.string(), name: z.string(), priceDelta: z.number().int() })),
  note: z.string().optional(),
});

const TransactionSchema = z.object({
  units: z.array(z.object({ lineIndex: z.number().int(), quantity: z.number().int() })),
  promo: z.object({ id: z.string(), name: z.string() }).nullable(),
  subtotal: z.number().int(),
  discount: z.number().int(),
  total: z.number().int(),
});

export const OrderPricingSnapshotSchema = z.object({
  itemCount: z.number().int(),
  itemDiscount: z.number().int(),
  transactionDiscount: z.number().int(),
  compareAtTotal: z.number().int(),
  savings: z.number().int(),
  transactions: z.array(TransactionSchema),
  itemPromos: z.array(
    z.object({ promoId: z.string(), promoName: z.string(), lineIndex: z.number().int(), quantity: z.number().int(), discount: z.number().int() }),
  ),
  splitMethod: z.enum(["single", "exact", "greedy"]),
});
export type OrderPricingSnapshot = z.infer<typeof OrderPricingSnapshotSchema>;

export const OrderRecordSchema = z.object({
  id: z.string(),
  status: z.enum(ORDER_STATUSES),
  brand: z.object({ slug: z.string(), name: z.string(), accent: z.string().nullish() }),
  outletCode: z.string().nullish(),
  outletLabel: z.string(),
  customerName: z.string(),
  customerWa: z.string(),
  pickupMode: z.enum(["now", "scheduled"]),
  pickupAt: z.string(),
  items: z.array(PricedLineSchema),
  pricing: OrderPricingSnapshotSchema,
  subtotal: z.number().int(),
  discount: z.number().int(),
  fee: z.number().int(),
  total: z.number().int(),
  cancellationReason: z.string().nullish(),
  needsRefund: z.boolean(),
  expiresAt: z.string(),
  paidAt: z.string().nullish(),
  createdAt: z.string(),
  telegram: z.object({ chatId: z.string(), messageId: z.number().int() }).nullish(),
});
export type OrderRecord = z.infer<typeof OrderRecordSchema>;

/** Yang boleh dilihat customer lewat link pesanan (tanpa data internal). */
export type PublicOrder = Omit<OrderRecord, "telegram" | "needsRefund">;

export function toPublicOrder(order: OrderRecord): PublicOrder {
  const { telegram: _telegram, needsRefund: _needsRefund, ...rest } = order;
  void _telegram;
  void _needsRefund;
  return rest;
}
