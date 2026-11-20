import type { CatalogSnapshot } from "./snapshot";
import type { ResolvedProduct } from "./types";

/**
 * Menyusun produk sebagaimana dilihat customer di satu outlet, langsung dari snapshot.
 * Dipakai untuk pratinjau hasil import dan test. (Di produksi, bentuk yang sama
 * disusun dari database.)
 */
export function resolveProductFromSnapshot(
  snapshot: CatalogSnapshot,
  outletCode: string,
  productId: string,
): ResolvedProduct | null {
  const outlet = snapshot.outlets.find((o) => o.code === outletCode);
  const product = snapshot.products.find((p) => p.id === productId);
  if (!outlet || !product) return null;
  const priceList = snapshot.priceLists.find((pl) => pl.code === outlet.priceListCode);
  const basePrice = priceList?.basePrices[productId];
  if (!priceList || basePrice === undefined) return null;

  const availability = snapshot.availability.find((a) => a.outletCode === outletCode && a.productId === productId);
  const overrides = priceList.optionDeltas[productId] ?? {};
  const groups = new Map(snapshot.optionGroups.map((g) => [g.id, g]));

  return {
    id: product.id,
    name: product.name,
    basePrice,
    ...(priceList.compareAtBasePrices[productId] !== undefined
      ? { compareAtPrice: priceList.compareAtBasePrices[productId] }
      : {}),
    status: availability?.status ?? "available",
    optionGroups: product.optionGroupIds.map((gid) => {
      const g = groups.get(gid)!;
      return {
        id: g.id,
        name: g.name,
        selection: g.selection,
        min: g.min,
        max: g.max,
        options: g.options.map((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: overrides[o.id] ?? o.priceDelta,
          ...(o.compareAtDelta !== undefined ? { compareAtDelta: o.compareAtDelta } : {}),
          isDefault: o.isDefault,
          ...(o.requiresAnyOf ? { requiresAnyOf: o.requiresAnyOf } : {}),
        })),
      };
    }),
  };
}

/** Pilihan default (opsi isDefault, atau opsi pertama untuk grup wajib). */
export function defaultOptionIds(product: ResolvedProduct): string[] {
  const chosen: string[] = [];
  for (const g of product.optionGroups) {
    const allowed = g.options.filter(
      (o) => !o.requiresAnyOf || o.requiresAnyOf.some((r) => chosen.includes(r)),
    );
    const defaults = allowed.filter((o) => o.isDefault);
    const pick = defaults.length > 0 ? defaults.slice(0, g.selection === "single" ? 1 : defaults.length) : [];
    if (pick.length < g.min) pick.push(...allowed.filter((o) => !pick.includes(o)).slice(0, g.min - pick.length));
    chosen.push(...pick.map((o) => o.id));
  }
  return chosen;
}
