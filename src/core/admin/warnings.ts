import type { FeeRules } from "../pricing/rules";

/**
 * Peringatan margin untuk pemilik: biaya jasa yang bisa melebihi potongan promo membuat
 * customer tidak hemat (bahkan lebih mahal dari beli sendiri). Hanya peringatan, tidak memblokir.
 */

export interface PromoLike {
  name: string;
  level: "transaction" | "item";
  type: "percent" | "fixed";
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  minQty?: number | null;
  active?: boolean;
}

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/** Biaya jasa untuk transaksi berisi n item. */
function feeForItems(fee: FeeRules, n: number): number {
  if (fee.type === "per_order") return fee.amount;
  if (fee.type === "per_item") return n === 1 ? (fee.singleItemAmount ?? fee.amount) : fee.amount * n;
  return 0;
}

/**
 * Promo potongan tetap yang tidak lebih besar dari biaya jasa membuat customer tidak hemat:
 * - promo per produk: dibandingkan dengan biaya jasa per item;
 * - voucher per transaksi: dibandingkan dengan biaya jasa transaksi terkecil yang boleh memakainya.
 * Promo persen tanpa batas bergantung harga menu, jadi tidak diperiksa; yang punya batas diperiksa per porsi.
 */
export function promoMarginWarnings(fee: FeeRules, promos: PromoLike[]): string[] {
  if (fee.type === "none") return [];
  const out: string[] = [];
  for (const promo of promos) {
    if (promo.active === false) continue;
    if (promo.level === "item") {
      const perItem = fee.type === "per_item" ? Math.max(fee.amount, fee.singleItemAmount ?? 0) : 0;
      if (perItem === 0) continue;
      if (promo.type === "fixed" && promo.value <= perItem) {
        out.push(`"${promo.name}": potongan ${rp(promo.value)} per porsi tidak lebih besar dari biaya jasa ${rp(perItem)} per item.`);
      } else if (promo.type === "percent" && promo.maxDiscount !== null && promo.maxDiscount <= perItem) {
        out.push(`"${promo.name}": potongan maksimal ${rp(promo.maxDiscount)} bisa lebih kecil dari biaya jasa ${rp(perItem)} per item.`);
      }
      continue;
    }
    if (promo.type !== "fixed") continue;
    const items = Math.max(promo.minQty ?? 1, 1);
    const cost = feeForItems(fee, items);
    if (cost > 0 && promo.value <= cost) {
      out.push(`"${promo.name}": potongan ${rp(promo.value)} tidak lebih besar dari biaya jasa ${rp(cost)} untuk transaksi ${items} item.`);
    }
  }
  return out;
}

/** Peringatan umum tentang kombinasi pengaturan brand yang janggal. */
export function brandWarnings(brand: { isActive: boolean; productCount: number; outletCount: number; outletMode: "catalog" | "customer_input" }): string[] {
  const out: string[] = [];
  if (brand.isActive && brand.productCount === 0) out.push("Brand aktif tapi belum punya menu yang tampil. Customer akan melihat Segera hadir.");
  if (brand.isActive && brand.outletMode === "catalog" && brand.outletCount === 0) out.push("Brand aktif tapi belum punya outlet.");
  return out;
}
