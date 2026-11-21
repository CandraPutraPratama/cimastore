/**
 * Koreksi menu Kopi Kenangan terhadap harga resmi (audit 21 Nov 2026, 5 outlet sample).
 * Data mentah (Bintang) tidak diubah; koreksi diterapkan oleh importer di atas menu per outlet.
 *
 * Harga resmi = harga yang dipakai. Tier harga diturunkan dari kategori outlet:
 * Airport = bandara, Mall = mall, selain itu = normal. Belum diaudit untuk kategori lain
 * (Train Station, Gas Station, dst.).
 * Tidak dijual (keputusan pemilik): Seliter 1L dan Merch.
 */

export type KkTier = "normal" | "mall" | "bandara";

export function kkTierOf(category: string | null | undefined): KkTier {
  if (category === "Airport") return "bandara";
  if (category === "Mall") return "mall";
  return "normal";
}

interface NewProduct {
  name: string;
  /** Kategori menu (salah satu KK_CATEGORY_ORDER). */
  category: string;
  /** ID resmi KK kalau diketahui; tanpa ini dipakai id sintetis. Tidak boleh bentrok dengan produk lain. */
  id?: number;
  /** Nama produk di kustomisasi yang opsinya ditiru. Tanpa ini = dijual tanpa pilihan. */
  optionsLike?: string;
  /** Berlaku di semua outlet menurut tier. */
  tierPrices?: Partial<Record<KkTier, number>>;
  /** Berlaku hanya di outlet tertentu (kode outlet -> harga). */
  outletPrices?: Record<string, number>;
}

const MSC = "MSC";
const LIPPO = "LIPPO-PURI";
const TNG = "TNG.SOETTA2";

const tiers = (normal: number, mall: number, bandara: number) => ({ normal, mall, bandara });

/** Bagian A dan B: produk yang tidak ada di data mentah. Opsi minuman ditiru dari produk serupa. */
export const KK_NEW_PRODUCTS: NewProduct[] = [
  { name: "Apple Americano", category: "Coffee", optionsLike: "Banana Americano", tierPrices: tiers(24000, 24000, 24000) },
  { name: "Apple Tea", category: "Non Coffee", optionsLike: "Lemon Black Tea", tierPrices: tiers(18000, 18000, 18000) },
  { name: "Peach Tea", category: "Non Coffee", optionsLike: "Lemon Black Tea", tierPrices: tiers(18000, 18000, 18000) },
  { name: "Thai Tea", category: "Non Coffee", optionsLike: "OG Thai Tea", tierPrices: tiers(22000, 22000, 34000) },
  { name: "Honey Latte", category: "Coffee", optionsLike: "Latte", tierPrices: tiers(22000, 24000, 32000) },
  { name: "Honey Macchiato Cream Americano", category: "Coffee", optionsLike: "Banana Americano", tierPrices: tiers(19000, 21000, 29000) },
  { name: "Orange Americano", category: "Coffee", optionsLike: "Banana Americano", tierPrices: tiers(17000, 19000, 27000) },
  { name: "Oatside Boba Gula Aren", category: "Non Coffee", optionsLike: "Susu Boba Gula Aren", tierPrices: tiers(27000, 27000, 39000) },
  { name: "Dreamy Choco Orange", category: "Non Coffee", optionsLike: "Dutch Chocolate", tierPrices: tiers(19000, 21000, 29000) },
  { name: "Chocolate Milk Bun", category: "Food", tierPrices: tiers(25000, 25000, 34000) },
  { name: "Vanilla Milk Bun", category: "Food", tierPrices: tiers(25000, 25000, 34000) },
  // Freezy: opsi ditiru dari Kenangan Frappe.
  { name: "Freezy Dutch Chocolate", category: "Kenangan Frappe", optionsLike: "Dutch Choco Kenangan Frappe", tierPrices: tiers(28000, 33000, 38000) },
  { name: "Freezy Kopi Kenangan Mantan", category: "Kenangan Frappe", optionsLike: "Kopi Kenangan Mantan Frappe", tierPrices: tiers(23000, 28000, 32000) },
  { name: "Freezy Latte", category: "Kenangan Frappe", optionsLike: "Kopi Kenangan Mantan Frappe", tierPrices: tiers(25000, 30000, 35000) },
  { name: "Freezy Matcha Latte", category: "Kenangan Frappe", optionsLike: "Matcha Kenangan Frappe", tierPrices: tiers(25000, 30000, 35000) },
  { name: "Freezy Mocha Latte", category: "Kenangan Frappe", optionsLike: "Kopi Kenangan Mantan Frappe", tierPrices: tiers(30000, 35000, 41000) },
  { name: "Freezy Nobo Honey Mango", category: "Kenangan Frappe", optionsLike: "Dutch Choco Kenangan Frappe", tierPrices: tiers(26000, 28000, 36000) },
  // Hanya sellable di sebagian outlet sample: ditambah ke outlet itu saja.
  { name: "Archipelago Blend", category: "Coffee", outletPrices: { [MSC]: 95000, [TNG]: 95000 } },
  { name: "Archipelago Reserve", category: "Coffee", outletPrices: { [LIPPO]: 110000, [MSC]: 110000, [TNG]: 110000 } },
  { name: "Sparks Americano", category: "Coffee", optionsLike: "Banana Americano", outletPrices: { [MSC]: 20000 } },
  { name: "Nobo Honey Mango", category: "Non Coffee", optionsLike: "Lemon Black Tea", outletPrices: { [LIPPO]: 26000 } },
  { name: "Master Chef Peach Aren Latte", category: "Coffee", optionsLike: "Creamy Aren Latte", outletPrices: { [TNG]: 32000 } },
  { name: "Strawberry Cromboloni", category: "Food", outletPrices: { [LIPPO]: 26000 } },
  { name: "Coffee Bombolone", category: "Food", outletPrices: { [TNG]: 22000 } },
  { name: "Cream Cheese Bombolone", category: "Food", outletPrices: { [TNG]: 22000 } },
  { name: "Vanilla Bombolone", category: "Food", outletPrices: { [TNG]: 22000 } },
  { name: "Matcha Brioche au Craquelin", category: "Food", outletPrices: { [TNG]: 25000 } },
  { name: "Pain au Chocolat", category: "Food", outletPrices: { [TNG]: 35000 } },
  // Produk sendiri, bukan "Friend Chip Cookie" (id 1261, Rp19.000). Id resmi KK 8122 (product_info TNG, 21 Nov);
  // di data mentah id ini hanya dipakai produk bernama sama ("Friend-chip Cookie", kategori Boulangerie).
  { id: 8122, name: "Friend-chip Cookie", category: "Food", outletPrices: { [TNG]: 25000 } },
];

/**
 * Bagian C: produk yang sudah ada di katalog tapi hilang dari menu outlet ini.
 */
export const KK_OUTLET_ADDITIONS: Record<string, Record<string, number>> = {
  "KK.SBY.MERRNGKTDT": { "Roti Srikaya": 15000, "Roti Susu Manis": 9000, "Sugar Donut": 10000 },
  MSC: { "Choco Chip Cookies": 14000, "Join the Dark Side Cookie": 29000, "Spanish Latte": 19000 },
  "AEON.BSD": { "Butter Croissant": 15000 },
  [TNG]: { "Choco Chip Cookies": 20000, "Raspberry Hibiscus": 30000, "Roti Keju Manis": 17000, "Roti Susu Manis": 15000 },
};

interface PriceFix {
  from: number;
  to: number;
  /** Dibatasi ke satu tier; tanpa ini berlaku di semua tier. */
  tier?: KkTier;
}

/** Bagian D: harga Bintang yang meleset dari harga resmi. Hanya harga persis `from` yang diganti. */
export const KK_PRICE_FIXES: Record<string, PriceFix[]> = {
  Americano: [{ from: 20000, to: 18000 }, { from: 17000, to: 15000 }],
  "Butterscotch Aren Latte": [{ from: 22000, to: 21000 }, { from: 20000, to: 19000 }],
  "Friend Chip Cookie": [{ from: 17000, to: 19000 }],
  "Kenangan Milk Tea": [{ from: 21000, to: 19000 }],
  "Lemon Black Tea": [{ from: 19000, to: 17000 }, { from: 17000, to: 15000 }],
  "Matcha Latte": [{ from: 27000, to: 24000 }, { from: 25000, to: 22000 }],
  "Milo Dinosaurus": [{ from: 23000, to: 22000 }],
  "Raspberry Hibiscus": [{ from: 22000, to: 20000 }, { from: 20000, to: 18000 }],
  "Roti Keju Manis": [{ from: 13000, to: 12000 }],
  "Roti Susu Manis": [{ from: 10000, to: 9000 }],
  "Avocado Coffee": [{ from: 31000, to: 28000 }],
  "Butter Croissant": [{ from: 25000, to: 27000, tier: "bandara" }],
};

/** Kunci nama: huruf kecil, spasi dirapikan. Tanda hubung dipertahankan ("Friend-chip" != "Friend Chip"). */
export const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Id sintetis untuk produk tambahan (id asli Bintang jauh di bawah ini). */
export const KK_NEW_PRODUCT_ID_BASE = 900_001;

export interface PatchItem {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  originalPrice?: number | null;
  image?: string | null;
  isSoldOut?: boolean | null;
}
export type PatchMenu = Map<number, { item: PatchItem; categories: Set<string> }>;

export interface PatchResult {
  /** Produk baru: id sintetis -> nama produk kustomisasi yang ditiru (kosong = tanpa opsi). */
  newProducts: Array<{ id: number; name: string; category: string; optionsLike?: string }>;
  priceFixed: number;
  added: number;
  warnings: string[];
}

/**
 * Menerapkan koreksi ke menu per outlet (diubah di tempat). `categories` = kategori tiap kode outlet.
 * Harga hasil koreksi tidak memakai harga coret karena sudah harga resmi.
 */
export function applyKkMenuPatch(menus: Map<string, PatchMenu>, outletCategory: Map<string, string | null | undefined>): PatchResult {
  const warnings: string[] = [];
  const result: PatchResult = { newProducts: [], priceFixed: 0, added: 0, warnings };

  // Contoh item untuk produk yang sudah ada (dicari lewat nama), dipakai untuk bagian C.
  const known = new Map<string, { item: PatchItem; categories: Set<string> }>();
  for (const menu of menus.values()) {
    for (const entry of menu.values()) {
      const key = normName(entry.item.name);
      if (!known.has(key)) known.set(key, entry);
    }
  }

  // D: koreksi harga.
  for (const [code, menu] of menus) {
    const tier = kkTierOf(outletCategory.get(code));
    for (const [id, entry] of menu) {
      const fixes = Object.entries(KK_PRICE_FIXES).find(([name]) => normName(name) === normName(entry.item.name))?.[1];
      const fix = fixes?.find((f) => f.from === entry.item.price && (!f.tier || f.tier === tier));
      if (!fix) continue;
      menu.set(id, { ...entry, item: { ...entry.item, price: fix.to, originalPrice: null } });
      result.priceFixed++;
    }
  }

  // C: produk lama yang hilang dari outlet tertentu.
  for (const [code, additions] of Object.entries(KK_OUTLET_ADDITIONS)) {
    const menu = menus.get(code);
    if (!menu) continue;
    for (const [name, price] of Object.entries(additions)) {
      const entry = known.get(normName(name));
      if (!entry) {
        warnings.push(`Koreksi menu: produk "${name}" tidak ditemukan di data, dilewati untuk ${code}.`);
        continue;
      }
      menu.set(entry.item.id, { categories: entry.categories, item: { ...entry.item, price, originalPrice: null, isSoldOut: false } });
      result.added++;
    }
  }

  // A dan B: produk baru.
  KK_NEW_PRODUCTS.forEach((p, index) => {
    const id = p.id ?? KK_NEW_PRODUCT_ID_BASE + index;
    let sold = 0;
    for (const [code, menu] of menus) {
      const price = p.outletPrices?.[code] ?? p.tierPrices?.[kkTierOf(outletCategory.get(code))];
      if (price === undefined) continue;
      menu.set(id, { categories: new Set([p.category]), item: { id, name: p.name, price, originalPrice: null, isSoldOut: false } });
      sold++;
    }
    if (sold === 0) {
      warnings.push(`Koreksi menu: produk baru "${p.name}" tidak masuk outlet mana pun.`);
      return;
    }
    result.added += sold;
    result.newProducts.push({ id, name: p.name, category: p.category, ...(p.optionsLike ? { optionsLike: p.optionsLike } : {}) });
  });

  return result;
}
