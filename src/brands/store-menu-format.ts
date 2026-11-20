import { z } from "zod";
import { dedupePriceLists, type PriceListContent } from "../core/catalog/dedupe";
import type { CatalogSnapshotInput } from "../core/catalog/snapshot";
import { cleanText, OptionGroupRegistry, slugify, toHHmm, type ImportReport } from "./shared";

/**
 * Konverter untuk format data "menu master + daftar outlet" (dipakai data Chagee dan Chatime):
 * - produk punya harga small/regular/large dan grup add-on,
 * - opsi add-on bisa dibatasi untuk ukuran tertentu (only_size),
 * - opsional: harga & stok per outlet.
 */

const SIZES = ["small", "regular", "large"] as const;
type Size = (typeof SIZES)[number];
const SIZE_LABEL: Record<Size, string> = { small: "Small", regular: "Regular", large: "Large" };

const price = z.number().int().positive().nullable().optional();

const RawOptionSchema = z.object({
  label: z.string(),
  price: z.number().int().nonnegative().default(0),
  is_default: z.boolean().nullable().optional(),
  only_size: z.enum(SIZES).nullable().optional(),
});

const RawGroupSchema = z.object({
  group_name: z.string(),
  type: z.enum(["single", "multiple"]),
  is_required: z.boolean().nullable().optional(),
  max_choices: z.number().int().positive().nullable().optional(),
  options: z.array(RawOptionSchema),
});

export const RawProductSchema = z.object({
  product_code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  categories: z.array(z.string()).nullable().optional(),
  small_price: price,
  regular_price: price,
  large_price: price,
  is_small_available: z.boolean().nullable().optional(),
  is_regular_available: z.boolean().nullable().optional(),
  is_large_available: z.boolean().nullable().optional(),
  is_available: z.boolean().nullable().optional(),
  addons: z.array(RawGroupSchema).nullable().optional(),
});

export const RawOutletSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  open_status: z.string().nullable().optional(),
  real_close_time: z.string().nullable().optional(),
});

export const RawOutletMenuSchema = z.object({
  outlet_code: z.string().min(1),
  menu_items: z.array(
    z.object({
      product_code: z.string().min(1),
      small_price: price,
      regular_price: price,
      large_price: price,
      is_sold_out: z.boolean().nullable().optional(),
    }),
  ),
});

export type RawProduct = z.infer<typeof RawProductSchema>;
export type RawOutlet = z.infer<typeof RawOutletSchema>;
export type RawOutletMenu = z.infer<typeof RawOutletMenuSchema>;

export interface StoreMenuFormatOptions {
  brand: string;
  source: string;
  generatedAt: string;
  /** Prefix kode price list, misal "cg". */
  priceListPrefix: string;
  /** Rapikan nama outlet (misal buang awalan "Chatime - "). */
  cleanOutletName?: (name: string) => string;
  cleanAddress?: (address: string) => string | undefined;
  /** Kota yang tidak bermakna (misal "Lainnya") dibuang. */
  ignoredCities?: string[];
  /** Host foto yang tidak boleh dipakai (bukan milik brand). */
  blockedImageHosts?: string[];
}

interface SizePrices {
  small?: number | null;
  regular?: number | null;
  large?: number | null;
}

function availableSizes(p: RawProduct): Size[] {
  const flags: Record<Size, boolean | null | undefined> = {
    small: p.is_small_available,
    regular: p.is_regular_available,
    large: p.is_large_available,
  };
  return SIZES.filter((s) => flags[s] && (p[`${s}_price`] ?? 0) > 0);
}

/** "PEARL (L)" -> "Pearl", "ESPRESSO SHOT R" -> "Espresso Shot" (ukuran sudah diwakili requiresAnyOf). */
export function cleanOptionLabel(label: string, sizeSpecific: boolean): string {
  let text = cleanText(label) ?? "Opsi";
  if (sizeSpecific) text = text.replace(/\s*\((r|l|s)\)\s*$/i, "").replace(/\s+(r|l|s)$/i, "").trim();
  if (text === text.toUpperCase() && /[A-Z]{3,}/.test(text)) {
    text = text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bCt\b/g, "CT");
  }
  return text;
}

function pricesOf(row: { small_price?: number | null; regular_price?: number | null; large_price?: number | null }): SizePrices {
  return { small: row.small_price, regular: row.regular_price, large: row.large_price };
}

/** Harga dasar = ukuran termurah; ukuran lain jadi tambahan harga. */
function sizePricing(sizes: Size[], prices: SizePrices) {
  const known = sizes.filter((s) => (prices[s] ?? 0) > 0);
  if (known.length === 0) return null;
  const base = Math.min(...known.map((s) => prices[s]!));
  const deltas = Object.fromEntries(known.map((s) => [s, prices[s]! - base])) as Partial<Record<Size, number>>;
  return { base, deltas };
}

export function buildStoreMenuSnapshot(
  input: Record<string, unknown> & { products?: unknown; outlets?: unknown; outletMenus?: unknown },
  options: StoreMenuFormatOptions,
): { snapshot: CatalogSnapshotInput; report: ImportReport } {
  const warnings: string[] = [];
  const products = z.array(RawProductSchema).parse(input.products);
  const outlets = z.array(RawOutletSchema).parse(input.outlets);
  const outletMenus = input.outletMenus ? z.array(RawOutletMenuSchema).parse(input.outletMenus) : null;

  const registry = new OptionGroupRegistry();
  const categories = new Map<string, string>();
  const snapProducts: CatalogSnapshotInput["products"] = [];
  const sizeOptionIds = new Map<string, Partial<Record<Size, string>>>();
  const productSizes = new Map<string, Size[]>();
  const masterBase: Record<string, number> = {};
  let droppedImages = 0;

  for (const p of products) {
    if (p.is_available === false) continue;
    const sizes = availableSizes(p);
    const pricing = sizePricing(sizes, pricesOf(p));
    if (!pricing) {
      warnings.push(`Produk ${p.name} (${p.product_code}) dilewati: tidak ada harga.`);
      continue;
    }
    productSizes.set(p.product_code, sizes);
    masterBase[p.product_code] = pricing.base;

    const categoryName = cleanText(p.categories?.[0]) ?? "Lainnya";
    const categoryId = slugify(categoryName) || "lainnya";
    categories.set(categoryId, categoryName);

    const groupIds: string[] = [];
    const sizeIds: Partial<Record<Size, string>> = {};
    if (sizes.length > 1) {
      const defaultSize = sizes.includes("regular") ? "regular" : sizes[0];
      const { id, optionIdByKey } = registry.register({
        name: "Ukuran",
        selection: "single",
        min: 1,
        max: 1,
        options: sizes.map((s) => ({
          key: s,
          name: SIZE_LABEL[s],
          priceDelta: pricing.deltas[s] ?? 0,
          isDefault: s === defaultSize,
        })),
      });
      groupIds.push(id);
      for (const s of sizes) sizeIds[s] = optionIdByKey.get(s);
    }
    sizeOptionIds.set(p.product_code, sizeIds);

    for (const g of p.addons ?? []) {
      const opts = g.options.filter((o) => !o.only_size || sizes.includes(o.only_size));
      if (opts.length === 0) continue;
      const required = g.is_required === true;
      const { id } = registry.register({
        name: cleanText(g.group_name) ?? "Pilihan",
        selection: g.type,
        min: required ? 1 : 0,
        max: g.type === "single" ? 1 : (g.max_choices ?? null),
        options: opts.map((o) => {
          const sizeOption = o.only_size && sizes.length > 1 ? sizeIds[o.only_size] : undefined;
          return {
            name: cleanOptionLabel(o.label, Boolean(o.only_size)),
            key: `${o.label}|${o.only_size ?? ""}`,
            priceDelta: o.price,
            isDefault: o.is_default === true,
            ...(sizeOption ? { requiresAnyOf: [sizeOption] } : {}),
          };
        }),
      });
      groupIds.push(id);
    }

    let imageUrl: string | undefined;
    if (p.image_url && /^https:\/\//.test(p.image_url)) {
      const host = new URL(p.image_url).host;
      if (options.blockedImageHosts?.some((h) => host === h || host.endsWith(`.${h}`))) droppedImages++;
      else imageUrl = p.image_url;
    }

    snapProducts.push({
      id: p.product_code,
      categoryId,
      name: cleanText(p.name)!,
      ...(cleanText(p.description) ? { description: cleanText(p.description) } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      optionGroupIds: groupIds,
    });
  }

  const groups = registry.all();
  const groupDelta = new Map<string, number>();
  for (const g of groups) for (const o of g.options) groupDelta.set(o.id, o.priceDelta);

  // Price list: per outlet bila ada data harga outlet, selain itu satu price list dari menu master.
  const entries: Array<{ outletCode: string; content: PriceListContent }> = [];
  const availability: CatalogSnapshotInput["availability"] = [];
  const activeOutlets = outlets.filter((o) => o.is_active !== false);
  const menuByOutlet = new Map(outletMenus?.map((m) => [m.outlet_code, m]) ?? []);

  for (const outlet of activeOutlets) {
    const menu = menuByOutlet.get(outlet.code);
    if (!menu) {
      if (outletMenus) warnings.push(`Outlet ${outlet.code} tidak punya data menu, memakai harga menu master.`);
      entries.push({ outletCode: outlet.code, content: { basePrices: masterBase, compareAtBasePrices: {}, optionDeltas: {} } });
      continue;
    }
    const basePrices: Record<string, number> = {};
    const optionDeltas: Record<string, Record<string, number>> = {};
    for (const item of menu.menu_items) {
      const sizes = productSizes.get(item.product_code);
      if (!sizes) continue;
      const pricing = sizePricing(sizes, pricesOf(item));
      if (!pricing) continue;
      basePrices[item.product_code] = pricing.base;
      const ids = sizeOptionIds.get(item.product_code) ?? {};
      for (const s of sizes) {
        const optionId = ids[s];
        const delta = pricing.deltas[s];
        if (optionId && delta !== undefined && delta !== groupDelta.get(optionId)) {
          (optionDeltas[item.product_code] ??= {})[optionId] = delta;
        }
      }
      if (item.is_sold_out) availability.push({ outletCode: outlet.code, productId: item.product_code, status: "sold_out" });
    }
    for (const productId of productSizes.keys()) {
      if (!(productId in basePrices)) availability.push({ outletCode: outlet.code, productId, status: "hidden" });
    }
    entries.push({ outletCode: outlet.code, content: { basePrices, compareAtBasePrices: {}, optionDeltas } });
  }

  const { priceLists, priceListByOutlet } = dedupePriceLists(entries, options.priceListPrefix);

  const snapOutlets: CatalogSnapshotInput["outlets"] = activeOutlets.map((o) => {
    const open = toHHmm(o.open_status);
    const close = toHHmm(o.real_close_time);
    const rawCity = cleanText(o.city);
    // Sebagian data menaruh nama jalan di kolom kota.
    const city = rawCity && !/^(jl|jln|jalan)\b/i.test(rawCity) ? rawCity : undefined;
    const address = o.address ? (options.cleanAddress ?? cleanText)(o.address) : undefined;
    return {
      code: o.code,
      name: (options.cleanOutletName ?? ((n: string) => n))(cleanText(o.name)!),
      ...(city && !options.ignoredCities?.includes(city) ? { city } : {}),
      ...(address ? { address } : {}),
      ...(o.latitude != null && o.longitude != null ? { lat: o.latitude, lng: o.longitude } : {}),
      hours: open && close ? { open, close } : null,
      priceListCode: priceListByOutlet.get(o.code)!,
    };
  });

  if (droppedImages > 0) warnings.push(`${droppedImages} foto produk tidak dipakai karena berasal dari server pihak ketiga.`);
  const skippedOutlets = outlets.length - activeOutlets.length;
  if (skippedOutlets > 0) warnings.push(`${skippedOutlets} outlet nonaktif dilewati.`);

  return {
    snapshot: {
      brand: options.brand,
      generatedAt: options.generatedAt,
      source: options.source,
      outlets: snapOutlets,
      categories: [...categories].map(([id, name]) => ({ id, name })),
      optionGroups: groups,
      products: snapProducts,
      priceLists,
      availability,
    },
    report: {
      brand: options.brand,
      counts: {
        outlets: snapOutlets.length,
        products: snapProducts.length,
        categories: categories.size,
        optionGroups: groups.length,
        priceLists: priceLists.length,
        soldOut: availability.filter((a) => a.status === "sold_out").length,
        hiddenAtOutlet: availability.filter((a) => a.status === "hidden").length,
      },
      warnings,
    },
  };
}
