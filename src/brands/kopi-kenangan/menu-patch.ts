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

const TNG = "TNG.SOETTA2";

/**
 * Produk baru yang tidak ada di data mentah (mekanisme A/B, harga per tier atau per outlet).
 * Dikosongkan atas keputusan pemilik 21 Nov 2026: 32 menu lama tidak dijual lagi.
 * Daftarnya ada di riwayat git (commit 51c638c s.d. 50cd0a9) untuk dikembalikan bila perlu.
 */
export const KK_NEW_PRODUCTS: NewProduct[] = [];

/**
 * Bagian C: produk yang sudah ada di katalog tapi hilang dari menu outlet ini.
 */
export const KK_OUTLET_ADDITIONS: Record<string, Record<string, number>> = {
  "KK.SBY.MERRNGKTDT": { "Roti Srikaya": 15000, "Roti Susu Manis": 9000, "Sugar Donut": 10000 },
  MSC: { "Choco Chip Cookies": 14000, "Join the Dark Side Cookie": 29000, "Spanish Latte": 19000 },
  "AEON.BSD": { "Butter Croissant": 15000 },
  [TNG]: { "Choco Chip Cookies": 20000, "Raspberry Hibiscus": 30000, "Roti Keju Manis": 17000, "Roti Susu Manis": 15000 },
  // Ronde 2 (audit pasca-import 21 Nov): outlet di luar 5 outlet sample. Entri bisa menambah produk
  // yang hilang atau menimpa harga produk yang sudah ada di outlet itu.
  // GANDCITY: outlet premium, harga resmi di atas tier bandara. Honey Latte, Freezy Nobo Honey Mango dan
  // Friend-chip Cookie (produk baru) diatur lewat outletPrices.
  "JKT.GANDCITY": { "Join the Dark Side Cookie": 29000, Latte: 35000, Cappuccino: 35000, "Butterscotch Sea Salt Latte": 44000, "Caramel Macchiato": 45000, Babyccino: 28000 },
  SMS: { "Butter Croissant": 15000, "Sugar Donut": 10000, "Join the Dark Side Cookie": 29000, Latte: 22000, Cappuccino: 22000 },
  "MDN.KUALANAMU": {
    // "1 Pcs KrunChi" (resmi Rp24.000) sengaja tidak ditambah: KrunChi disembunyikan oleh aturan pemilik (importer.ts).
    "Friend Chip Cookie": 19000, "Join the Dark Side Cookie": 29000, "Milk Tea Boba": 23000,
    Latte: 22000, Cappuccino: 22000, "Chocolate Croissant": 19000, "Butter Croissant": 15000, "Roti Coklat Klasik": 9000,
    "Choco Chip Cookies": 14000, "Sugar Donut": 10000, "Chocolate Donut": 13000, "Roti Srikaya": 15000,
  },
  "DPR.BUNGURHRAI": {
    "Milk Tea Boba": 35000, "Oatside Matcha Latte": 35000, "Roti Keju Manis": 17000,
    "Susu Boba Gula Aren": 36000, "Oatside Kopi Kenangan Mantan": 31000, "Oatside Latte": 35000, "Friend Chip Cookie": 25000,
  },
};

/**
 * Bagian D: harga resmi ABSOLUT per tier untuk item yang harga Bintang-nya meleset.
 * Harga outlet di-set ke nilai tier-nya apa pun harga awalnya. Tier tanpa nilai = tidak diubah.
 * Nilai bandara dari TNG.SOETTA2 dan DPR.BUNGURHRAI (identik). Friend Chip Cookie tidak dijual di bandara.
 */
export const KK_PRICE_FIXES: Record<string, Partial<Record<KkTier, number>>> = {
  // Harga penentu tier; terverifikasi di ratusan outlet.
  "Kopi Kenangan Mantan": { normal: 19000, mall: 22000, bandara: 32000 },
  Americano: { normal: 15000, mall: 18000, bandara: 30000 },
  "Butterscotch Aren Latte": { normal: 19000, mall: 21000, bandara: 29000 },
  "Friend Chip Cookie": { normal: 19000, mall: 19000 },
  "Kenangan Milk Tea": { normal: 19000, mall: 19000, bandara: 30000 },
  "Lemon Black Tea": { normal: 15000, mall: 17000, bandara: 31000 },
  "Matcha Latte": { normal: 22000, mall: 24000, bandara: 32000 },
  "Milo Dinosaurus": { normal: 22000, mall: 22000, bandara: 32000 },
  "Raspberry Hibiscus": { normal: 18000, mall: 20000, bandara: 30000 },
  "Roti Keju Manis": { normal: 12000, mall: 12000, bandara: 17000 },
  "Roti Susu Manis": { normal: 9000, mall: 9000, bandara: 15000 },
  "Avocado Coffee": { normal: 28000, bandara: 38000 },
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
      // Produk yang sudah ada di outlet ini ditimpa pada id-nya sendiri; kalau belum ada, ambil contoh dari outlet lain.
      const entry = [...menu.values()].find((e) => normName(e.item.name) === normName(name)) ?? known.get(normName(name));
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
