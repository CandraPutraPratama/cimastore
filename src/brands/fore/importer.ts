import { z } from "zod";
import { dedupePriceLists } from "../../core/catalog/dedupe";
import type { CatalogSnapshotInput } from "../../core/catalog/snapshot";
import type { BrandImporter } from "../registry";
import { buildPerOutletPricing, cleanText, OptionGroupRegistry, toHHmm, type ImportReport, type OutletMenuItem } from "../shared";

/**
 * Fore Coffee.
 * Sumber: outlets-fore.json, data_fore/menu_fore_<id>.json (menu & harga per outlet),
 * kustomisasi-fore.json (diekstrak dari jasdorkopicima v1, berasal dari Excel kustomisasi Fore).
 *
 * Di data menu, minuman Iced dan Hot adalah produk terpisah ("Iced Aren Latte", "Hot Aren Latte"),
 * jadi data kustomisasi dicocokkan setelah awalan Iced/Hot dibuang. Pilihan es hanya untuk produk Iced.
 * Merchandise, aksesoris, kategori "Others", dan Coffee of The Day tidak dijual.
 */

// Coffee of The Day: sudah tidak dijual pemilik (20 Nov 2026).
const EXCLUDED_CATEGORIES = new Set(["Merchandise", "Merchandise Accessories", "Others", "Fore x Citilink", "Coffee of The Day"]);
const FOOD_CATEGORIES = new Set(["Fore Deli"]);

const RawOutletSchema = z.object({
  id: z.number().int(),
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  openHours: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

const RawMenuSchema = z.object({
  categories: z
    .array(
      z.object({
        categoryName: z.string(),
        items: z.array(
          z.object({
            id: z.number().int(),
            name: z.string(),
            description: z.string().nullable().optional(),
            price: z.number().int().nonnegative(),
            normalPrice: z.number().int().nonnegative().nullable().optional(),
            image: z.string().nullable().optional(),
            isSoldOut: z.boolean().nullable().optional(),
          }),
        ),
      }),
    )
    .nullable()
    .optional(),
});

const priced = z.array(z.object({ name: z.string(), price: z.number().int().nonnegative() })).default([]);
const RawCustomizationSchema = z.object({
  largeAddition: z.number().int().positive().default(7000),
  products: z.record(
    z.string(),
    z.object({
      nama: z.string(),
      hasCustomization: z.boolean(),
      canIce: z.boolean(),
      canHot: z.boolean(),
      sizes: z.object({ regular: z.boolean(), large: z.boolean() }),
      iceOptions: z.array(z.string()).default([]),
      sweetnessOptions: z.array(z.string()).default([]),
      espressoOptions: priced,
      dairyOptions: priced,
      syrupOptions: priced,
      toppingOptions: priced,
    }),
  ),
});

type ForeCustom = z.infer<typeof RawCustomizationSchema>["products"][string];

export function foreKey(name: string): { key: string; temperature: "iced" | "hot" | null } {
  const n = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const m = /^(iced|hot) (.+)$/.exec(n);
  return m ? { key: m[2], temperature: m[1] as "iced" | "hot" } : { key: n, temperature: null };
}

/** "07:00 - 23:00 WIB" -> { open: "07:00", close: "23:00" } */
export function parseForeHours(text: string | null | undefined): { open: string; close: string } | null {
  const m = /(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/.exec(text ?? "");
  if (!m) return null;
  const open = toHHmm(m[1].replace(".", ":"));
  const close = toHHmm(m[2].replace(".", ":"));
  return open && close ? { open, close } : null;
}

function buildOptionGroups(
  registry: OptionGroupRegistry,
  c: ForeCustom,
  temperature: "iced" | "hot" | null,
  largeAddition: number,
): string[] {
  if (!c.hasCustomization) return [];
  const ids: string[] = [];
  const single = (name: string, options: Array<{ name: string; price: number }>) => {
    if (options.length < 2) return;
    ids.push(
      registry.register({
        name,
        selection: "single",
        min: 1,
        max: 1,
        options: options.map((o, i) => ({ name: o.name, priceDelta: o.price, isDefault: i === 0 })),
      }).id,
    );
  };
  const multiple = (name: string, options: Array<{ name: string; price: number }>) => {
    if (options.length === 0) return;
    ids.push(
      registry.register({
        name,
        selection: "multiple",
        min: 0,
        max: null,
        options: options.map((o) => ({ name: o.name, priceDelta: o.price })),
      }).id,
    );
  };

  if (c.sizes.regular && c.sizes.large) {
    single("Ukuran", [
      { name: "Regular", price: 0 },
      { name: "Large", price: largeAddition },
    ]);
  }
  const iced = temperature === "iced" || (temperature === null && c.canIce && !c.canHot);
  if (iced) single("Es", c.iceOptions.map((name) => ({ name, price: 0 })));
  single("Manis", c.sweetnessOptions.map((name) => ({ name, price: 0 })));
  single("Espresso", c.espressoOptions);
  single("Susu", c.dairyOptions);
  multiple("Syrup", c.syrupOptions);
  multiple("Topping", c.toppingOptions);
  return ids;
}

export function buildForeSnapshot(
  raw: Record<string, unknown>,
  generatedAt: string,
): { snapshot: CatalogSnapshotInput; report: ImportReport } {
  const warnings: string[] = [];
  const outlets = z.array(RawOutletSchema).parse(raw.outlets);
  const custom = RawCustomizationSchema.parse(raw.customization);
  const customByKey = new Map(Object.entries(custom.products).map(([k, v]) => [foreKey(k).key, v]));
  const menuFiles = z.record(z.string(), z.unknown()).parse(raw.menus ?? {});

  type Item = { id: number; name: string; description?: string | null; price: number; normalPrice?: number | null; image?: string | null; isSoldOut?: boolean | null };
  const menus = new Map<string, Map<number, { item: Item; category: string }>>();
  const categoryOrder: string[] = [];
  for (const outlet of outlets) {
    const parsed = RawMenuSchema.safeParse(menuFiles[`menu_fore_${outlet.id}.json`]);
    const items = new Map<number, { item: Item; category: string }>();
    for (const cat of parsed.success ? (parsed.data.categories ?? []) : []) {
      if (EXCLUDED_CATEGORIES.has(cat.categoryName)) continue;
      if (!categoryOrder.includes(cat.categoryName)) categoryOrder.push(cat.categoryName);
      for (const item of cat.items) if (!items.has(item.id)) items.set(item.id, { item, category: cat.categoryName });
    }
    if (items.size === 0) {
      warnings.push(`Outlet ${outlet.name} dilewati: menu kosong atau tidak ada.`);
      continue;
    }
    menus.set(outlet.code, items);
  }

  const info = new Map<number, { item: Item; category: string; outlets: number }>();
  for (const items of menus.values()) {
    for (const [id, { item, category }] of items) {
      const existing = info.get(id);
      if (existing) existing.outlets++;
      else info.set(id, { item, category, outlets: 1 });
    }
  }

  const registry = new OptionGroupRegistry();
  const products: CatalogSnapshotInput["products"] = [];
  const included = new Set<string>();
  const missing: Array<{ name: string; outlets: number }> = [];
  for (const [id, { item, category, outlets: count }] of [...info].sort((a, b) => b[1].outlets - a[1].outlets)) {
    const name = cleanText(item.name)!;
    const { key, temperature } = foreKey(name);
    const c = customByKey.get(key);
    if (!c && !FOOD_CATEGORIES.has(category)) {
      missing.push({ name, outlets: count });
      continue;
    }
    const image = item.image && /^https:\/\//.test(item.image) ? item.image : undefined;
    products.push({
      id: String(id),
      categoryId: category,
      name,
      ...(cleanText(item.description) ? { description: cleanText(item.description) } : {}),
      ...(image ? { imageUrl: image } : {}),
      optionGroupIds: c ? buildOptionGroups(registry, c, temperature, custom.largeAddition) : [],
    });
    included.add(String(id));
  }

  const outletItems = new Map<string, Map<string, OutletMenuItem>>(
    [...menus].map(([code, items]) => [
      code,
      new Map(
        [...items].map(([id, { item }]) => [String(id), { price: item.price, originalPrice: item.normalPrice, isSoldOut: item.isSoldOut }] as const),
      ),
    ]),
  );
  const { entries, availability } = buildPerOutletPricing(outletItems, included);
  const { priceLists, priceListByOutlet } = dedupePriceLists(entries, "fr");

  const snapOutlets: CatalogSnapshotInput["outlets"] = outlets
    .filter((o) => menus.has(o.code))
    .map((o) => {
      const address = cleanText(o.address?.replace(/^fore coffee[^-]*-\s*/i, ""));
      return {
        code: o.code,
        name: cleanText(o.name)!,
        ...(address ? { address } : {}),
        ...(o.lat != null && o.lng != null && o.lat !== 0 ? { lat: o.lat, lng: o.lng } : {}),
        hours: parseForeHours(o.openHours),
        priceListCode: priceListByOutlet.get(o.code)!,
      };
    });

  const usedCategories = new Set(products.map((p) => p.categoryId));
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} produk tidak dijual karena belum ada data kustomisasi: ` +
        missing.map((m) => `${m.name} (${m.outlets} outlet)`).join(", "),
    );
  }

  return {
    snapshot: {
      brand: "fore",
      generatedAt,
      source: "data pemilik: outlets-fore.json + data_fore/menu_fore_<id>.json + kustomisasi-fore.json (dari v1)",
      outlets: snapOutlets,
      categories: categoryOrder.filter((c) => usedCategories.has(c)).map((c) => ({ id: c, name: c })),
      optionGroups: registry.all(),
      products,
      priceLists,
      availability,
    },
    report: {
      brand: "fore",
      counts: {
        outlets: snapOutlets.length,
        products: products.length,
        productsWithOptions: products.filter((p) => (p.optionGroupIds?.length ?? 0) > 0).length,
        missingCustomization: missing.length,
        optionGroups: registry.all().length,
        priceLists: priceLists.length,
        soldOut: availability.filter((a) => a.status === "sold_out").length,
      },
      warnings,
    },
  };
}

export const foreImporter: BrandImporter = {
  brand: "fore",
  files: { outlets: "outlets-fore.json", customization: "kustomisasi-fore.json" },
  dirs: { menus: { dir: "data_fore", pattern: /^menu_fore_\d+\.json$/ } },
  build: buildForeSnapshot,
};
