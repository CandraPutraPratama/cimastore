import { CatalogSnapshotSchema, type CatalogSnapshot } from "./snapshot";

/**
 * Impor katalog dari file CSV (menu, dan opsional outlet) menjadi CatalogSnapshot standar.
 * Murni: tidak membaca database. Data yang sudah ada diberikan lewat `existing` supaya
 * impor ulang memakai id yang sama (produk tidak menggandakan diri).
 *
 * Kolom menu:   kategori, nama, harga  (wajib)  |  deskripsi, foto, kode (opsional)
 * Kolom outlet: kode, nama (wajib)  |  kota, alamat, buka, tutup, lat, lng (opsional)
 * Pemisah kolom koma, titik koma (Excel Indonesia), atau tab: dikenali otomatis.
 */

export const MAX_CSV_CHARS = 1_000_000;
export const MAX_MENU_ROWS = 3000;
export const MAX_OUTLET_ROWS = 2000;
const MAX_ISSUES = 40;

// -----------------------------------------------------------------------------
// Membaca CSV
// -----------------------------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const d of [";", ",", "\t"]) {
    let inQuotes = false;
    let count = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Membaca teks CSV menjadi baris-baris kolom. Mendukung tanda kutip, "" dan baris baru di dalam kutip. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Pembantu
// -----------------------------------------------------------------------------

export interface CsvIssue {
  file: "menu" | "outlet" | "umum";
  /** Nomor baris di file (judul kolom = baris 1). 0 bila bukan soal satu baris. */
  line: number;
  message: string;
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** "35.000", "Rp 35.000", "35000", "35.000,00" menjadi 35000. Selain itu null. */
export function parseRupiahText(text: string): number | null {
  const s = text
    .trim()
    .replace(/^rp\.?\s*/i, "")
    .replace(/[.,]00$/, "")
    .replace(/[.,\s]/g, "");
  if (!/^\d{1,9}$/.test(s)) return null;
  return Number(s);
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const MENU_COLUMNS = {
  kategori: ["kategori", "category", "grup"],
  nama: ["nama", "name", "produk", "nama produk", "menu"],
  harga: ["harga", "price"],
  deskripsi: ["deskripsi", "description", "keterangan"],
  foto: ["foto", "gambar", "image", "url foto", "link foto"],
  kode: ["kode", "id", "sku", "kode produk"],
} as const;

const OUTLET_COLUMNS = {
  kode: ["kode", "code", "id", "kode outlet"],
  nama: ["nama", "name", "outlet", "nama outlet"],
  kota: ["kota", "city"],
  alamat: ["alamat", "address"],
  buka: ["buka", "open", "jam buka"],
  tutup: ["tutup", "close", "jam tutup"],
  lat: ["lat", "latitude"],
  lng: ["lng", "lon", "longitude"],
} as const;

function mapColumns<T extends Record<string, readonly string[]>>(
  header: string[],
  spec: T,
): Partial<Record<keyof T, number>> {
  const cols: Partial<Record<keyof T, number>> = {};
  const names = header.map(key);
  for (const field of Object.keys(spec) as Array<keyof T>) {
    const idx = names.findIndex((n) => spec[field].includes(n));
    if (idx >= 0) cols[field] = idx;
  }
  return cols;
}

function normalizeTime(text: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isHttpUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Hasil
// -----------------------------------------------------------------------------

export interface ExistingCatalog {
  categories: Array<{ externalId: string; name: string }>;
  products: Array<{ externalId: string; name: string; category: string; isActive: boolean }>;
  outletCodes: string[];
  priceListCodes: string[];
}

export interface CsvImportInput {
  brandSlug: string;
  outletMode: "catalog" | "customer_input";
  menuCsv: string;
  outletsCsv?: string;
  existing: ExistingCatalog;
  now: string;
  source: string;
}

export interface CsvPreview {
  categories: number;
  products: number;
  newProducts: number;
  updatedProducts: number;
  /** Produk aktif yang sudah ada tetapi tidak ada di file. */
  missingProducts: number;
  outlets: number | null;
  newOutlets: number;
  missingOutlets: number;
  sample: Array<{ category: string; name: string; price: number }>;
  warnings: string[];
}

export type CsvImportResult =
  | {
      ok: true;
      snapshot: CatalogSnapshot;
      /** Opsi untuk admin_catalog_import (deactivateMissing diisi pemanggil). */
      options: { syncOutlets: boolean; rewritePriceLists: true; replaceOptions: false };
      preview: CsvPreview;
    }
  | { ok: false; issues: CsvIssue[] };

// -----------------------------------------------------------------------------
// Pembuat snapshot
// -----------------------------------------------------------------------------

export function buildSnapshotFromCsv(input: CsvImportInput): CsvImportResult {
  const issues: CsvIssue[] = [];
  const add = (file: CsvIssue["file"], line: number, message: string) => {
    if (issues.length < MAX_ISSUES) issues.push({ file, line, message });
  };

  if (input.menuCsv.length > MAX_CSV_CHARS || (input.outletsCsv?.length ?? 0) > MAX_CSV_CHARS) {
    return { ok: false, issues: [{ file: "umum", line: 0, message: "File terlalu besar (maksimal 1 MB)." }] };
  }

  // Price list: satu daftar harga seragam. Brand dengan banyak daftar harga (harga beda per outlet) tidak didukung.
  const priceListCode = input.existing.priceListCodes.length === 1 ? input.existing.priceListCodes[0] : "default";
  if (input.existing.priceListCodes.length > 1) {
    return {
      ok: false,
      issues: [
        {
          file: "umum",
          line: 0,
          message: "Brand ini punya harga berbeda per outlet, jadi tidak bisa diimpor lewat CSV. Gunakan impor data brand.",
        },
      ],
    };
  }

  // --- Menu ---
  const menuRows = parseCsv(input.menuCsv).filter((r) => r.some((c) => c.trim() !== ""));
  if (menuRows.length < 2) {
    return { ok: false, issues: [{ file: "menu", line: 0, message: "File menu kosong. Baris pertama harus berisi judul kolom, lalu minimal satu produk." }] };
  }
  if (menuRows.length - 1 > MAX_MENU_ROWS) {
    return { ok: false, issues: [{ file: "menu", line: 0, message: `Terlalu banyak produk (maksimal ${MAX_MENU_ROWS} baris).` }] };
  }
  const mc = mapColumns(menuRows[0], MENU_COLUMNS);
  for (const need of ["kategori", "nama", "harga"] as const) {
    if (mc[need] === undefined) add("menu", 1, `Kolom "${need}" tidak ditemukan di judul kolom.`);
  }
  if (issues.length > 0) return { ok: false, issues };

  const cell = (row: string[], idx: number | undefined) => (idx === undefined ? "" : (row[idx] ?? "").trim());

  const existingCatByName = new Map(input.existing.categories.map((c) => [key(c.name), c.externalId]));
  const existingProdByKey = new Map(input.existing.products.map((p) => [`${key(p.category)}|${key(p.name)}`, p.externalId]));
  const existingProdIds = new Set(input.existing.products.map((p) => p.externalId));

  const categories: Array<{ id: string; name: string }> = [];
  const categoryIdByName = new Map<string, string>();
  const usedCategoryIds = new Set<string>();
  const categoryFor = (name: string): string => {
    const k = key(name);
    const known = categoryIdByName.get(k);
    if (known) return known;
    let id = existingCatByName.get(k) ?? `c-${slugify(name) || "kategori"}`;
    let n = 2;
    const base = id;
    while (usedCategoryIds.has(id)) id = `${base}-${n++}`;
    usedCategoryIds.add(id);
    categoryIdByName.set(k, id);
    categories.push({ id, name });
    return id;
  };

  const products: CatalogSnapshot["products"] = [];
  const basePrices: Record<string, number> = {};
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const sample: CsvPreview["sample"] = [];
  let updated = 0;

  for (let i = 1; i < menuRows.length; i++) {
    const row = menuRows[i];
    const line = i + 1;
    const category = cell(row, mc.kategori);
    const name = cell(row, mc.nama);
    const priceText = cell(row, mc.harga);
    const description = cell(row, mc.deskripsi);
    const photo = cell(row, mc.foto);
    const code = cell(row, mc.kode);

    if (!category) add("menu", line, "Kategori kosong.");
    if (!name) add("menu", line, "Nama kosong.");
    if (category.length > 60) add("menu", line, "Nama kategori terlalu panjang (maksimal 60 karakter).");
    if (name.length > 120) add("menu", line, "Nama produk terlalu panjang (maksimal 120 karakter).");
    const price = parseRupiahText(priceText);
    if (price === null) add("menu", line, priceText ? `Harga "${priceText}" bukan angka rupiah.` : "Harga kosong.");
    if (photo && !isHttpUrl(photo)) add("menu", line, "Foto harus berupa alamat web (https://...).");
    if (code.length > 60) add("menu", line, "Kode produk terlalu panjang (maksimal 60 karakter).");
    if (!category || !name || price === null || category.length > 60 || name.length > 120) continue;

    const dedupeKey = `${key(category)}|${key(name)}`;
    if (seenKeys.has(dedupeKey)) {
      add("menu", line, `Produk ganda: "${name}" di kategori "${category}" sudah ada di baris sebelumnya.`);
      continue;
    }
    seenKeys.add(dedupeKey);

    const id = code || existingProdByKey.get(dedupeKey) || `m-${slugify(category) || "x"}-${slugify(name) || "x"}`;
    if (seenIds.has(id)) {
      add("menu", line, `Kode produk "${id}" dipakai dua kali.`);
      continue;
    }
    seenIds.add(id);
    if (existingProdIds.has(id)) updated++;

    const categoryId = categoryFor(category);
    products.push({
      id,
      categoryId,
      name,
      description: description || undefined,
      imageUrl: photo || undefined,
      optionGroupIds: [],
    });
    basePrices[id] = price;
    if (sample.length < 8) sample.push({ category, name, price });
  }

  // --- Outlet ---
  const warnings: string[] = [];
  let outlets: CatalogSnapshot["outlets"] = [];
  let syncOutlets = false;
  const outletCodes = new Set<string>();

  if (input.outletMode === "customer_input") {
    if (input.outletsCsv?.trim()) add("outlet", 0, "Brand ini tidak memakai daftar outlet (customer mengetik sendiri), jadi file outlet tidak dipakai.");
    outlets = [{ code: "menu", name: "Menu", priceListCode }];
    syncOutlets = true;
    outletCodes.add("menu");
  } else if (input.outletsCsv?.trim()) {
    const outletRows = parseCsv(input.outletsCsv).filter((r) => r.some((c) => c.trim() !== ""));
    if (outletRows.length < 2) {
      add("outlet", 0, "File outlet kosong. Baris pertama harus berisi judul kolom, lalu minimal satu outlet.");
    } else if (outletRows.length - 1 > MAX_OUTLET_ROWS) {
      add("outlet", 0, `Terlalu banyak outlet (maksimal ${MAX_OUTLET_ROWS} baris).`);
    } else {
      const oc = mapColumns(outletRows[0], OUTLET_COLUMNS);
      for (const need of ["kode", "nama"] as const) {
        if (oc[need] === undefined) add("outlet", 1, `Kolom "${need}" tidak ditemukan di judul kolom.`);
      }
      if (oc.kode !== undefined && oc.nama !== undefined) {
        for (let i = 1; i < outletRows.length; i++) {
          const row = outletRows[i];
          const line = i + 1;
          const code = cell(row, oc.kode);
          const name = cell(row, oc.nama);
          if (!code || !name) {
            add("outlet", line, !code ? "Kode outlet kosong." : "Nama outlet kosong.");
            continue;
          }
          if (outletCodes.has(code)) {
            add("outlet", line, `Kode outlet "${code}" dipakai dua kali.`);
            continue;
          }
          outletCodes.add(code);
          const openText = cell(row, oc.buka);
          const closeText = cell(row, oc.tutup);
          let hours: { open: string; close: string } | undefined;
          if (openText || closeText) {
            const open = normalizeTime(openText);
            const close = normalizeTime(closeText);
            if (!open || !close) add("outlet", line, "Jam buka dan tutup harus berpasangan, format 08:00.");
            else hours = { open, close };
          }
          const latText = cell(row, oc.lat);
          const lngText = cell(row, oc.lng);
          const lat = latText ? Number(latText.replace(",", ".")) : undefined;
          const lng = lngText ? Number(lngText.replace(",", ".")) : undefined;
          if ((lat !== undefined && !(lat >= -90 && lat <= 90)) || (lng !== undefined && !(lng >= -180 && lng <= 180))) {
            add("outlet", line, "Koordinat tidak valid.");
            continue;
          }
          outlets.push({
            code,
            name,
            city: cell(row, oc.kota) || undefined,
            address: cell(row, oc.alamat) || undefined,
            lat,
            lng,
            hours: hours ?? null,
            priceListCode,
          });
        }
        syncOutlets = true;
      }
    }
  } else if (input.existing.outletCodes.length === 0) {
    warnings.push("Brand ini belum punya outlet. Menu baru tampil ke customer setelah ada outlet (unggah file outlet).");
  }

  if (issues.length > 0) return { ok: false, issues };

  const snapshotInput = {
    brand: input.brandSlug,
    generatedAt: input.now,
    source: input.source,
    outlets,
    categories,
    optionGroups: [],
    products,
    priceLists: [{ code: priceListCode, basePrices, compareAtBasePrices: {}, optionDeltas: {} }],
    availability: [],
  };
  const parsed = CatalogSnapshotSchema.safeParse(snapshotInput);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 10).map((i) => ({ file: "umum" as const, line: 0, message: i.message })),
    };
  }

  const present = new Set(products.map((p) => p.id));
  const missingProducts = input.existing.products.filter((p) => p.isActive && !present.has(p.externalId)).length;
  const existingOutlets = new Set(input.existing.outletCodes);
  const missingOutlets = syncOutlets ? input.existing.outletCodes.filter((c) => !outletCodes.has(c)).length : 0;

  return {
    ok: true,
    snapshot: parsed.data,
    options: { syncOutlets, rewritePriceLists: true, replaceOptions: false },
    preview: {
      categories: categories.length,
      products: products.length,
      newProducts: products.length - updated,
      updatedProducts: updated,
      missingProducts,
      outlets: syncOutlets ? outlets.length : null,
      newOutlets: syncOutlets ? outlets.filter((o) => !existingOutlets.has(o.code)).length : 0,
      missingOutlets,
      sample,
      warnings,
    },
  };
}
