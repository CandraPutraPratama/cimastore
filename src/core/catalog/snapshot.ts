import { z } from "zod";

/**
 * Format katalog standar. Setiap importer brand (API, file JSON, CSV) wajib
 * menghasilkan bentuk ini; database hanya diisi dari CatalogSnapshot yang lolos validasi.
 * Semua id di sini adalah id dari sumber brand ("external"), bukan id database.
 */

const rupiah = z.number().int().nonnegative();
const id = z.string().trim().min(1);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:mm");

export const OpeningHoursSchema = z.object({ open: hhmm, close: hhmm });

export const SnapshotOutletSchema = z.object({
  code: id,
  name: id,
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  hours: OpeningHoursSchema.nullable().optional(),
  priceListCode: id,
});

export const SnapshotOptionSchema = z.object({
  id,
  name: id,
  priceDelta: rupiah,
  compareAtDelta: rupiah.optional(),
  isDefault: z.boolean().default(false),
  requiresAnyOf: z.array(id).optional(),
});

export const SnapshotOptionGroupSchema = z
  .object({
    id,
    name: id,
    selection: z.enum(["single", "multiple"]),
    min: z.number().int().nonnegative(),
    max: z.number().int().positive().nullable(),
    options: z.array(SnapshotOptionSchema).min(1),
  })
  .refine((g) => g.max === null || g.min <= g.max, { message: "min tidak boleh melebihi max" });

export const SnapshotCategorySchema = z.object({ id, name: id });

export const SnapshotProductSchema = z.object({
  id,
  categoryId: id,
  name: id,
  description: z.string().trim().optional(),
  imageUrl: z.url().optional(),
  optionGroupIds: z.array(id).default([]),
});

export const SnapshotPriceListSchema = z.object({
  code: id,
  /** Harga dasar per produk (productId -> rupiah). Produk tanpa harga = tidak dijual di price list ini. */
  basePrices: z.record(id, rupiah),
  /** Harga dasar asli brand bila berbeda (untuk harga coret). */
  compareAtBasePrices: z.record(id, rupiah).default({}),
  /** Override tambahan harga opsi untuk produk tertentu: productId -> optionId -> rupiah. */
  optionDeltas: z.record(id, z.record(id, rupiah)).default({}),
});

export const SnapshotAvailabilitySchema = z.object({
  outletCode: id,
  productId: id,
  status: z.enum(["sold_out", "hidden"]),
});

export const CatalogSnapshotSchema = z
  .object({
    brand: id,
    generatedAt: z.iso.datetime({ offset: true }),
    source: z.string().trim().min(1),
    outlets: z.array(SnapshotOutletSchema),
    categories: z.array(SnapshotCategorySchema),
    optionGroups: z.array(SnapshotOptionGroupSchema),
    products: z.array(SnapshotProductSchema),
    priceLists: z.array(SnapshotPriceListSchema).min(1),
    availability: z.array(SnapshotAvailabilitySchema).default([]),
  })
  .superRefine((snap, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const dupes = (label: string, ids: string[]) => {
      const seen = new Set<string>();
      for (const x of ids) {
        if (seen.has(x)) issue(`${label} ganda: ${x}`);
        seen.add(x);
      }
      return seen;
    };

    const categories = dupes("Kategori", snap.categories.map((c) => c.id));
    const groups = dupes("Grup opsi", snap.optionGroups.map((g) => g.id));
    const products = dupes("Produk", snap.products.map((p) => p.id));
    const priceLists = dupes("Price list", snap.priceLists.map((p) => p.code));
    const outlets = dupes("Outlet", snap.outlets.map((o) => o.code));

    const optionIds = new Set<string>();
    for (const g of snap.optionGroups) {
      for (const o of g.options) {
        if (optionIds.has(o.id)) issue(`Opsi ganda: ${o.id}`);
        optionIds.add(o.id);
      }
    }
    for (const g of snap.optionGroups) {
      for (const o of g.options) {
        for (const r of o.requiresAnyOf ?? []) {
          if (!optionIds.has(r)) issue(`Opsi ${o.id} mensyaratkan opsi yang tidak ada: ${r}`);
        }
      }
    }

    for (const p of snap.products) {
      if (!categories.has(p.categoryId)) issue(`Produk ${p.id}: kategori tidak ada (${p.categoryId})`);
      for (const g of p.optionGroupIds) {
        if (!groups.has(g)) issue(`Produk ${p.id}: grup opsi tidak ada (${g})`);
      }
    }
    for (const o of snap.outlets) {
      if (!priceLists.has(o.priceListCode)) issue(`Outlet ${o.code}: price list tidak ada (${o.priceListCode})`);
    }
    for (const pl of snap.priceLists) {
      for (const pid of [...Object.keys(pl.basePrices), ...Object.keys(pl.optionDeltas)]) {
        if (!products.has(pid)) issue(`Price list ${pl.code}: produk tidak ada (${pid})`);
      }
      for (const deltas of Object.values(pl.optionDeltas)) {
        for (const oid of Object.keys(deltas)) {
          if (!optionIds.has(oid)) issue(`Price list ${pl.code}: opsi tidak ada (${oid})`);
        }
      }
    }
    for (const a of snap.availability) {
      if (!outlets.has(a.outletCode)) issue(`Ketersediaan: outlet tidak ada (${a.outletCode})`);
      if (!products.has(a.productId)) issue(`Ketersediaan: produk tidak ada (${a.productId})`);
    }
  });

export type CatalogSnapshot = z.output<typeof CatalogSnapshotSchema>;
export type CatalogSnapshotInput = z.input<typeof CatalogSnapshotSchema>;
export type SnapshotPriceList = z.output<typeof SnapshotPriceListSchema>;
