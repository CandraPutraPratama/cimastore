import { z } from "zod";

/**
 * Aturan promo dan fee per brand. Disimpan di database (tabel promos & brands.fee_rules)
 * dan divalidasi dengan skema ini sebelum dipakai mesin harga.
 * Lihat docs/ARCHITECTURE.md bagian 3 untuk arti tiap field.
 */

const rupiah = z.number().int().positive();
const count = z.number().int().positive();

export const PromoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** transaction: satu voucher per transaksi di app brand. item: khusus produk tertentu, bisa digabung. */
    level: z.enum(["transaction", "item"]),
    type: z.enum(["percent", "fixed"]),
    /** Persen (1-100) untuk percent, rupiah untuk fixed. */
    value: z.number().int().positive(),
    /** all_items: semua item di transaksi. cheapest_item: hanya 1 item termurah ("item kedua 50%"). */
    scope: z.enum(["all_items", "cheapest_item"]).default("all_items"),
    /** base_price: harga dasar saja (tambahan opsi tidak didiskon). subtotal: termasuk opsi. */
    appliesTo: z.enum(["base_price", "subtotal"]).default("subtotal"),
    /** Batas potongan. Untuk level item: per porsi. Untuk level transaction: per transaksi. */
    maxDiscount: rupiah.nullable().default(null),
    /** Minimal belanja dalam satu transaksi (setelah potongan promo item). */
    minSubtotal: rupiah.nullable().default(null),
    /** Jumlah item dalam satu transaksi agar voucher berlaku. */
    minQty: count.nullable().default(null),
    maxQty: count.nullable().default(null),
    /** Berapa kali voucher boleh dipakai per pesanan (null = tanpa batas). */
    maxUsesPerOrder: count.nullable().default(null),
    /** Khusus level item: maksimal porsi yang dapat promo per pesanan. */
    maxUnits: count.nullable().default(null),
    /** Kalau diisi, promo hanya untuk produk-produk ini. */
    productIds: z.array(z.string().min(1)).nullable().default(null),
    active: z.boolean().default(true),
    startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .refine((p) => p.type !== "percent" || p.value <= 100, {
    message: "Diskon persen maksimal 100",
    path: ["value"],
  })
  .refine((p) => p.minQty === null || p.maxQty === null || p.minQty <= p.maxQty, {
    message: "minQty tidak boleh melebihi maxQty",
    path: ["minQty"],
  })
  .refine((p) => p.level !== "item" || (p.productIds !== null && p.productIds.length > 0), {
    message: "Promo level item wajib menyebutkan produk",
    path: ["productIds"],
  });

export type Promo = z.output<typeof PromoSchema>;
export type PromoInput = z.input<typeof PromoSchema>;

export const FeeRulesSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("per_item"),
    amount: z.number().int().nonnegative(),
    /** Tarif khusus bila pesanan hanya 1 porsi (opsional). */
    singleItemAmount: z.number().int().nonnegative().nullable().default(null),
  }),
  z.object({ type: z.literal("per_order"), amount: z.number().int().nonnegative() }),
]);

export type FeeRules = z.output<typeof FeeRulesSchema>;

/** none: semua item satu transaksi. auto: mesin harga memecah ke beberapa transaksi bila lebih murah. */
export const SplitModeSchema = z.enum(["none", "auto"]);
export type SplitMode = z.output<typeof SplitModeSchema>;

export interface BrandPricingConfig {
  promos: Promo[];
  fee: FeeRules;
  splitMode: SplitMode;
}

/** Promo yang aktif pada waktu `now`. */
export function activePromos(promos: Promo[], now: Date): Promo[] {
  const t = now.getTime();
  return promos.filter(
    (p) =>
      p.active &&
      (p.startsAt === null || Date.parse(p.startsAt) <= t) &&
      (p.endsAt === null || Date.parse(p.endsAt) > t),
  );
}
