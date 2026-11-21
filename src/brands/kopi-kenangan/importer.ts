import { z } from "zod";
import { dedupePriceLists } from "../../core/catalog/dedupe";
import type { CatalogSnapshotInput } from "../../core/catalog/snapshot";
import type { BrandImporter } from "../registry";
import { buildPerOutletPricing, cleanText, OptionGroupRegistry, toHHmm, type ImportReport } from "../shared";
import { applyKkMenuPatch } from "./menu-patch";

/**
 * Kopi Kenangan.
 * Sumber: outlets-kopken.json (outlet), data/menu_<id>.json (menu & harga per outlet),
 * kustomisasi-kopken.json (varian & add-on per produk).
 *
 * Aturan bisnis (dari pemilik, sama seperti jasdorkopicima v1):
 * - Hanya kategori: Baru!, Coffee, Non Coffee, Kenangan Frappe, Kenangan Toast, Food.
 * - Tidak melayani outlet Kenangan Signature, Kenangan Heritage, dan Chigo.
 * - Produk Seliter, Chigo/ChiMate/KrunChi, FLIP, air mineral disembunyikan. Ukuran Jumbo tidak dijual.
 * - Tambahan harga flat: Large +5.000, Juwara Beans +3.000, Oatside +3.000.
 *   Syrup/Sauce +6.000, Topping +6.000. Whipped Cream gratis, pilih 1, khusus Frappe.
 * - Harga coret memakai harga asli KK (dari kombinasi SKU di file kustomisasi).
 * - Makanan (Food, Kenangan Toast) dijual tanpa pilihan apa pun.
 */

export const KK_CATEGORY_ORDER = ["Baru!", "Coffee", "Non Coffee", "Kenangan Frappe", "Kenangan Toast", "Food"];
const FOOD_CATEGORIES = new Set(["Kenangan Toast", "Food"]);
const FRAPPE_CATEGORY = "Kenangan Frappe";
const HIDDEN_PRODUCT_PATTERNS = [
  "seliter",
  "chigo",
  "chimate",
  "krunchi",
  "flip",
  "air mineral",
  "truffle mushroom",
  "aqua reflection",
  "pristine",
];
const FLAT_DELTA = { large: 5000, juwara: 3000, oatside: 3000 } as const;
const ADDON_PRICE = 6000;

export function isExcludedKkOutlet(outlet: { code: string; name: string; category?: string | null }): boolean {
  const code = outlet.code.trim().toUpperCase();
  const name = outlet.name.toLowerCase();
  return (
    outlet.category === "Kenangan Signature" ||
    code.startsWith("KS.") ||
    code.startsWith("KH.") ||
    code.startsWith("TESTPOS") ||
    /signature|heritage|chigo|internal testing/.test(name)
  );
}

export function isHiddenKkProduct(name: string): boolean {
  const n = name.toLowerCase();
  return HIDDEN_PRODUCT_PATTERNS.some((p) => n.includes(p));
}

const coord = z.union([z.string(), z.number()]).nullable().optional();
const RawOutletSchema = z.object({
  id: z.number().int(),
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  hours: z.object({ open: z.string().nullable().optional(), close: z.string().nullable().optional() }).nullable().optional(),
  coordinates: z.object({ lat: coord, lng: coord }).nullable().optional(),
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
            originalPrice: z.number().int().nonnegative().nullable().optional(),
            image: z.string().nullable().optional(),
            isSoldOut: z.boolean().nullable().optional(),
          }),
        ),
      }),
    )
    .nullable()
    .optional(),
});

const strings = z.array(z.string()).default([]);
const RawCustomizationSchema = z.object({
  products: z.record(
    z.string(),
    z.object({
      productId: z.number().int(),
      name: z.string(),
      category: z.string().optional(),
      options: z.object({
        temperatures: strings,
        sizes: strings,
        sugarLevels: strings,
        coffeeBeans: strings,
        dairyChoices: strings,
        iceLevels: strings,
      }),
      addons: z.array(z.object({ name: z.string(), price: z.number().int() })).default([]),
      combinations: z.array(z.object({ description: z.string(), price: z.number().int() })).default([]),
    }),
  ),
});

type RawCustomization = z.infer<typeof RawCustomizationSchema>["products"][string];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Selisih harga asli KK dari kombinasi SKU: harga(kombinasi dengan `variant`) - harga(kombinasi default). */
function realDelta(custom: RawCustomization, defaults: string[], from: string, to: string): number | undefined {
  const key = (tokens: string[]) => [...tokens].sort().join("|");
  const prices = new Map(custom.combinations.map((c) => [key(c.description.split(",").map((t) => t.trim())), c.price]));
  const base = prices.get(key(defaults));
  const variant = prices.get(key(defaults.map((t) => (t === from ? to : t))));
  if (base === undefined || variant === undefined || variant < base) return undefined;
  return variant - base;
}

function sortSugar(levels: string[]): string[] {
  const order = ["Normal Sugar", "Less Sugar", "No Sugar"];
  return [...levels].sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
}

function buildOptionGroups(registry: OptionGroupRegistry, custom: RawCustomization, isFrappe: boolean): string[] {
  const o = custom.options;
  const ids: string[] = [];
  const defaults = [
    o.temperatures[0],
    o.sizes.includes("Regular") ? "Regular" : undefined,
    o.coffeeBeans.includes("Kenangan Blend") ? "Kenangan Blend" : undefined,
    o.dairyChoices.includes("Milk") ? "Milk" : undefined,
    o.sugarLevels.includes("Normal Sugar") ? "Normal Sugar" : o.sugarLevels[0],
  ].filter((t): t is string => Boolean(t));

  let iceOptionId: string | undefined;
  if (o.temperatures.length > 1) {
    const g = registry.register({
      name: "Suhu",
      selection: "single",
      min: 1,
      max: 1,
      options: o.temperatures.map((t, i) => ({ key: t, name: t, priceDelta: 0, isDefault: i === 0 })),
    });
    ids.push(g.id);
    iceOptionId = g.optionIdByKey.get("Ice");
  }

  const sizes = o.sizes.filter((s) => s !== "Jumbo");
  if (sizes.includes("Regular") && sizes.includes("Large")) {
    const compareAt = realDelta(custom, defaults, "Regular", "Large");
    ids.push(
      registry.register({
        name: "Ukuran",
        selection: "single",
        min: 1,
        max: 1,
        options: [
          { name: "Regular", priceDelta: 0, isDefault: true },
          { name: "Large", priceDelta: FLAT_DELTA.large, ...(compareAt !== undefined ? { compareAtDelta: compareAt } : {}) },
        ],
      }).id,
    );
  }

  if (o.coffeeBeans.includes("Kenangan Blend") && o.coffeeBeans.includes("Juwara Beans")) {
    const compareAt = realDelta(custom, defaults, "Kenangan Blend", "Juwara Beans");
    ids.push(
      registry.register({
        name: "Beans",
        selection: "single",
        min: 1,
        max: 1,
        options: [
          { name: "Kenangan Blend", priceDelta: 0, isDefault: true },
          { name: "Juwara Beans", priceDelta: FLAT_DELTA.juwara, ...(compareAt !== undefined ? { compareAtDelta: compareAt } : {}) },
        ],
      }).id,
    );
  }

  if (o.dairyChoices.includes("Milk") && o.dairyChoices.includes("Oatside")) {
    const compareAt = realDelta(custom, defaults, "Milk", "Oatside");
    ids.push(
      registry.register({
        name: "Susu",
        selection: "single",
        min: 1,
        max: 1,
        options: [
          { name: "Fresh Milk", priceDelta: 0, isDefault: true },
          { name: "Oatside", priceDelta: FLAT_DELTA.oatside, ...(compareAt !== undefined ? { compareAtDelta: compareAt } : {}) },
        ],
      }).id,
    );
  }

  if (o.sugarLevels.length > 1) {
    ids.push(
      registry.register({
        name: "Gula",
        selection: "single",
        min: 1,
        max: 1,
        options: sortSugar(o.sugarLevels).map((s, i) => ({ name: s, priceDelta: 0, isDefault: i === 0 })),
      }).id,
    );
  }

  if (o.iceLevels.length > 0 && (iceOptionId || o.temperatures.length <= 1)) {
    ids.push(
      registry.register({
        name: "Es",
        selection: "single",
        // Kalau bisa Hot, pilihan es hanya muncul untuk Ice.
        min: iceOptionId ? 0 : 1,
        max: 1,
        options: o.iceLevels.map((level, i) => ({
          name: level,
          priceDelta: 0,
          isDefault: i === 0,
          ...(iceOptionId ? { requiresAnyOf: [iceOptionId] } : {}),
        })),
      }).id,
    );
  }

  const whipped = custom.addons.filter((a) => /whipped cream/i.test(a.name));
  const syrups = custom.addons.filter((a) => /syrup|sauce/i.test(a.name));
  const toppings = custom.addons.filter((a) => !syrups.includes(a) && (!isFrappe || !whipped.includes(a)));

  if (isFrappe && whipped.length > 0) {
    ids.push(
      registry.register({
        name: "Whipped Cream",
        selection: "single",
        min: 1,
        max: 1,
        options: [
          { name: "No Whipped Cream", priceDelta: 0, isDefault: true },
          ...whipped.map((a) => ({ name: a.name, priceDelta: 0 })),
        ],
      }).id,
    );
  }
  if (syrups.length > 0) {
    ids.push(
      registry.register({
        name: "Syrup",
        selection: "multiple",
        min: 0,
        max: null,
        options: syrups.map((a) => ({ name: a.name, priceDelta: ADDON_PRICE })),
      }).id,
    );
  }
  if (toppings.length > 0) {
    ids.push(
      registry.register({
        name: "Topping",
        selection: "multiple",
        min: 0,
        max: null,
        options: toppings.map((a) => ({ name: a.name, priceDelta: ADDON_PRICE })),
      }).id,
    );
  }
  return ids;
}

export function buildKopiKenanganSnapshot(
  raw: Record<string, unknown>,
  generatedAt: string,
): { snapshot: CatalogSnapshotInput; report: ImportReport } {
  const warnings: string[] = [];
  const outlets = z.array(RawOutletSchema).parse(raw.outlets);
  const customization = RawCustomizationSchema.parse(raw.customization).products;
  const menuFiles = z.record(z.string(), z.unknown()).parse(raw.menus ?? {});

  const customById = new Map(Object.values(customization).map((c) => [c.productId, c]));
  const customByName = new Map<string, RawCustomization | null>();
  for (const c of customById.values()) {
    const k = norm(c.name);
    customByName.set(k, customByName.has(k) ? null : c);
  }

  // 1. Baca menu tiap outlet yang dilayani.
  type Item = z.infer<typeof RawMenuSchema>["categories"] extends Array<infer C> | null | undefined
    ? C extends { items: Array<infer I> }
      ? I
      : never
    : never;
  const served = outlets.filter((o) => !isExcludedKkOutlet(o));
  const menus = new Map<string, Map<number, { item: Item; categories: Set<string> }>>();
  for (const outlet of served) {
    const file = menuFiles[`menu_${outlet.id}.json`];
    const parsed = file ? RawMenuSchema.safeParse(file) : null;
    const items = new Map<number, { item: Item; categories: Set<string> }>();
    for (const category of parsed?.success ? (parsed.data.categories ?? []) : []) {
      if (!KK_CATEGORY_ORDER.includes(category.categoryName)) continue;
      for (const item of category.items) {
        const entry = items.get(item.id);
        if (entry) entry.categories.add(category.categoryName);
        else items.set(item.id, { item, categories: new Set([category.categoryName]) });
      }
    }
    if (items.size === 0) {
      warnings.push(`Outlet ${outlet.code} (${outlet.name}) dilewati: menu kosong atau tidak ada.`);
      continue;
    }
    menus.set(outlet.code, items);
  }

  // 1b. Koreksi ke harga resmi dan tambah item yang hilang (menu-patch.ts).
  const patch = applyKkMenuPatch(menus);
  warnings.push(...patch.warnings);
  const plainNewProducts = new Set<number>();
  for (const p of patch.newProducts) {
    // Data kustomisasi produk itu sendiri didahulukan; template hanya cadangan.
    const own = customByName.get(norm(p.name));
    const template = own ?? (p.optionsLike ? customByName.get(norm(p.optionsLike)) : undefined);
    if (template) customById.set(p.id, template);
    else if (p.optionsLike) warnings.push(`Produk baru "${p.name}" dilewati: kustomisasi "${p.optionsLike}" tidak ditemukan.`);
    else plainNewProducts.add(p.id);
  }

  // 2. Gabungkan produk dari semua outlet.
  const productInfo = new Map<number, { item: Item; categories: Set<string>; outlets: number }>();
  for (const items of menus.values()) {
    for (const [id, { item, categories }] of items) {
      const info = productInfo.get(id);
      if (info) {
        info.outlets++;
        for (const c of categories) info.categories.add(c);
        if (!info.item.image && item.image) info.item = { ...info.item, image: item.image };
      } else productInfo.set(id, { item, categories: new Set(categories), outlets: 1 });
    }
  }

  // 3. Susun produk dan opsinya.
  const registry = new OptionGroupRegistry();
  const products: CatalogSnapshotInput["products"] = [];
  const included = new Set<number>();
  const missingCustomization: Array<{ name: string; outlets: number }> = [];
  let hiddenByRule = 0;
  let matchedByName = 0;

  const ordered = [...productInfo.entries()].sort((a, b) => b[1].outlets - a[1].outlets);
  for (const [id, info] of ordered) {
    const name = cleanText(info.item.name)!;
    if (isHiddenKkProduct(name)) {
      hiddenByRule++;
      continue;
    }
    const category = KK_CATEGORY_ORDER.find((c) => info.categories.has(c))!;
    let custom = customById.get(id);
    if (!custom) {
      const byName = customByName.get(norm(name));
      if (byName) {
        custom = byName;
        matchedByName++;
      }
    }
    // Makanan: kategori Food/Toast, atau produk tanpa satu pun pilihan (roti baru di kategori "Baru!").
    const isFood =
      [...info.categories].some((c) => FOOD_CATEGORIES.has(c)) ||
      plainNewProducts.has(id) ||
      (custom !== undefined && Object.values(custom.options).every((v) => v.length === 0));
    if (!custom && !isFood) {
      missingCustomization.push({ name, outlets: info.outlets });
      continue;
    }
    const isFrappe = info.categories.has(FRAPPE_CATEGORY);
    const image = info.item.image && /^https:\/\//.test(info.item.image) ? info.item.image : undefined;
    products.push({
      id: String(id),
      categoryId: category,
      name,
      ...(cleanText(info.item.description) ? { description: cleanText(info.item.description) } : {}),
      ...(image ? { imageUrl: image } : {}),
      // Makanan tidak punya varian/add-on (data sumber kadang menempelkan add-on minuman ke roti).
      optionGroupIds: custom && !isFood ? buildOptionGroups(registry, custom, isFrappe) : [],
    });
    included.add(id);
  }

  // 4. Price list & ketersediaan per outlet.
  const outletItems = new Map(
    [...menus].map(([code, items]) => [
      code,
      new Map([...items].map(([id, { item }]) => [String(id), item] as const)),
    ]),
  );
  const { entries, availability } = buildPerOutletPricing(outletItems, [...included].map(String));
  const { priceLists, priceListByOutlet } = dedupePriceLists(entries, "kk");

  const snapOutlets: CatalogSnapshotInput["outlets"] = served
    .filter((o) => menus.has(o.code))
    .map((o) => {
      const lat = Number(o.coordinates?.lat);
      const lng = Number(o.coordinates?.lng);
      const open = toHHmm(o.hours?.open);
      const close = toHHmm(o.hours?.close);
      const address = cleanText(o.address);
      return {
        code: o.code,
        name: cleanText(o.name)!,
        ...(address ? { address } : {}),
        ...(Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : {}),
        hours: open && close ? { open, close } : null,
        priceListCode: priceListByOutlet.get(o.code)!,
      };
    });

  const usedCategories = new Set(products.map((p) => p.categoryId));
  const excludedOutlets = outlets.length - served.length;
  if (excludedOutlets > 0) warnings.push(`${excludedOutlets} outlet Kenangan Signature/Heritage/Chigo tidak dilayani.`);
  if (matchedByName > 0) warnings.push(`${matchedByName} produk dicocokkan ke data kustomisasi lewat nama (ID berbeda).`);
  if (missingCustomization.length > 0) {
    warnings.push(
      `${missingCustomization.length} minuman tidak dijual karena belum ada data kustomisasi: ` +
        missingCustomization.map((m) => `${m.name} (${m.outlets} outlet)`).join(", "),
    );
  }

  return {
    snapshot: {
      brand: "kopi-kenangan",
      generatedAt,
      source: "data pemilik: outlets-kopken.json + data/menu_<id>.json + kustomisasi-kopken.json",
      outlets: snapOutlets,
      categories: KK_CATEGORY_ORDER.filter((c) => usedCategories.has(c)).map((c) => ({ id: c, name: c })),
      optionGroups: registry.all(),
      products,
      priceLists,
      availability,
    },
    report: {
      brand: "kopi-kenangan",
      counts: {
        outlets: snapOutlets.length,
        products: products.length,
        productsWithOptions: products.filter((p) => (p.optionGroupIds?.length ?? 0) > 0).length,
        hiddenByRule,
        missingCustomization: missingCustomization.length,
        optionGroups: registry.all().length,
        priceLists: priceLists.length,
        soldOut: availability.filter((a) => a.status === "sold_out").length,
      },
      warnings,
    },
  };
}

export const kopiKenanganImporter: BrandImporter = {
  brand: "kopi-kenangan",
  files: { outlets: "outlets-kopken.json", customization: "kustomisasi-kopken.json" },
  dirs: { menus: { dir: "data", pattern: /^menu_\d+\.json$/ } },
  build: buildKopiKenanganSnapshot,
};
