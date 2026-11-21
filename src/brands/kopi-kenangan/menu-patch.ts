/**
 * Koreksi menu Kopi Kenangan terhadap harga resmi (audit 21 Nov 2026).
 * Data mentah (Bintang) tidak diubah; koreksi diterapkan oleh importer di atas menu per outlet.
 *
 * Harga resmi = harga yang dipakai. Tier harga ditentukan per outlet (KK_TIER_OVERRIDES), BUKAN dari
 * kategori outlet: kategori Mall/Airport terbukti sering bertier normal. Outlet yang tidak ada di
 * peta dianggap normal. Peta ini baru berisi outlet yang sudah dicek ke API resmi.
 * Tidak dijual (keputusan pemilik): Seliter 1L dan Merch.
 * Peta mencakup scan resmi Mall/Rest Area/Gas Station/Airport (21 Nov 2026): Rest Area dan hampir semua
 * Gas Station normal. Normal juga: 7 outlet Mantan Rp18.000 (LA.MTRLMPG, PLG.OPIMALL, TGL.PCFCMALTGL,
 * TSM.PLZASIA, MGG.SPBBLDN, SLT.SPBUVTRN, SMN.SPBUADISCPT), 5 outlet tanpa minuman di data resmi
 * dan KK.BKS.PKWON (data kosong).
 * Pengecualian yang diperlakukan normal: CRB.SHELLCL (harga flat lebih murah dari normal),
 * JKT.CRPALMERAH (tier tidak bisa dicek, data resmi tanpa minuman).
 */

export type KkTier = "normal" | "mall" | "bandara";

const tierOf = (tier: KkTier, codes: string[]) => codes.map((c) => [c, tier] as const);

export const KK_TIER_OVERRIDES: Record<string, KkTier> = Object.fromEntries([
  // JKT.GANDCITY berkategori Mall tapi harga resmi bandara.
  ...tierOf("bandara", ["TNG.SOETTA2", "DPR.BUNGURHRAI", "JKT.GANDCITY"]),
  ...tierOf("mall", [
    "LIPPO-PURI", "AEON.BSD", "KOKAS", "GI", "PASARAYA", "LOTTEB",
    "BDG.CHMPLSWK", "BGR.AONMLSTLCT", "BPP.EWALK", "BTM.CITYSQR", "BTM.GRANDMALL", "DPK.MRGCITY",
    "JKT.ARTHAGDG", "JKT.LTSHAVNU", "JKT.PURDAHMALL", "JOG.RAMAIMBR", "KK.MKS.TSMMKSR", "MALL.KARAWACI",
    "MDN.CENPOINT", "MND.MANTOS", "PAKUWAN.MALL", "PLAZA.INDO", "SMR.BIGMALL", "SMR.CENTPLZA", "TGR.TERASKOTA",
  ]),
  // Berkategori Mall tapi harga resmi normal.
  ...tierOf("normal", [
    "ATRIUM", "SMS", "AMBAS", "BOTANI", "MKG3", "FC.SUNTER", "PP", "GANCIT", "DMALL", "PRAMUKA",
    "LIPPO.CIKA", "BAYWALK", "LIPPO.KJ", "AEON.JGC",
    // Berkategori Airport tapi harga resmi normal.
    "MDN.KUALANAMU", "KK.MDN.KUALNMUAPDPTR", "TGR.T2EKBSA", "TNG.T2FSOETA",
  ]),
]);

export function kkTierOf(outletCode: string): KkTier {
  return KK_TIER_OVERRIDES[outletCode] ?? "normal";
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

/**
 * Bagian D: harga resmi ABSOLUT per tier untuk item yang harga Bintang-nya meleset.
 * Harga outlet di-set ke nilai tier-nya apa pun harga awalnya. Tier tanpa nilai = tidak diubah.
 */
export const KK_PRICE_FIXES: Record<string, Partial<Record<KkTier, number>>> = {
  Americano: { normal: 15000, mall: 18000 },
  "Butterscotch Aren Latte": { normal: 19000, mall: 21000 },
  "Friend Chip Cookie": { normal: 19000, mall: 19000 },
  "Kenangan Milk Tea": { normal: 19000, mall: 19000 },
  "Lemon Black Tea": { normal: 15000, mall: 17000 },
  "Matcha Latte": { normal: 22000, mall: 24000 },
  "Milo Dinosaurus": { normal: 22000, mall: 22000 },
  "Raspberry Hibiscus": { normal: 18000, mall: 20000 },
  "Roti Keju Manis": { normal: 12000, mall: 12000 },
  "Roti Susu Manis": { normal: 9000, mall: 9000 },
  "Avocado Coffee": { normal: 28000 },
  "Butter Croissant": { bandara: 27000 },
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
 * Menerapkan koreksi ke menu per outlet (diubah di tempat). Tier outlet dari KK_TIER_OVERRIDES.
 * Harga hasil koreksi tidak memakai harga coret karena sudah harga resmi.
 */
export function applyKkMenuPatch(menus: Map<string, PatchMenu>): PatchResult {
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
    const tier = kkTierOf(code);
    for (const [id, entry] of menu) {
      const fixes = Object.entries(KK_PRICE_FIXES).find(([name]) => normName(name) === normName(entry.item.name))?.[1];
      const price = fixes?.[tier];
      if (price === undefined || price === entry.item.price) continue;
      menu.set(id, { ...entry, item: { ...entry.item, price, originalPrice: null } });
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
      const price = p.outletPrices?.[code] ?? p.tierPrices?.[kkTierOf(code)];
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
