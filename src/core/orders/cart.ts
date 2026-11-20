import { priceLine, type PricedLine } from "../catalog/selection";
import { menuPricingConfig, resolveMenuProduct, type MenuPayload } from "../catalog/storefront";
import { priceOrder, type PricedOrder } from "../pricing/engine";

/** Pilihan customer untuk satu baris keranjang (tanpa harga; harga selalu dihitung dari menu). */
export interface CartSelection {
  productId: string;
  optionIds: string[];
  quantity: number;
  note?: string;
}

export type CartLineResult =
  | { ok: true; line: PricedLine }
  | { ok: false; productId: string; name?: string; message: string };

export interface PricedCart {
  results: CartLineResult[];
  order: PricedOrder;
  /** Ada baris yang tidak bisa dipesan (habis, opsi berubah, dll). */
  hasProblems: boolean;
}

/**
 * Menghitung keranjang terhadap menu terbaru. Dipakai di browser (tampilan) dan di server
 * (sumber kebenaran saat membuat pesanan), jadi hasilnya selalu sama.
 */
export function priceCart(menu: MenuPayload, selections: CartSelection[], now: Date = new Date()): PricedCart {
  const results: CartLineResult[] = selections.map((s) => {
    const product = resolveMenuProduct(menu, s.productId);
    if (!product) return { ok: false, productId: s.productId, message: "Menu ini sudah tidak dijual di outlet ini." };
    const result = priceLine(product, s);
    return result.ok
      ? { ok: true, line: result.line }
      : { ok: false, productId: s.productId, name: product.name, message: result.errors[0].message };
  });
  const lines = results.flatMap((r) => (r.ok ? [r.line] : []));
  return {
    results,
    order: priceOrder(lines, menuPricingConfig(menu), { now }),
    hasProblems: results.some((r) => !r.ok),
  };
}
