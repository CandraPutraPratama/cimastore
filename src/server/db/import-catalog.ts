import type postgres from "postgres";
import type { CatalogSnapshot } from "../../core/catalog/snapshot";

/**
 * Memuat CatalogSnapshot (yang sudah lolos validasi) ke database dalam SATU transaksi:
 * kalau ada yang gagal, tidak ada yang berubah.
 *
 * Aturan:
 * - Upsert berdasarkan id sumber (external_id / external_code). Id database tetap stabil.
 * - Data yang hilang dari sumber TIDAK dihapus, hanya is_active = false (riwayat pesanan aman).
 *   Kecuali: relasi produk-grup opsi dan status produk per outlet diganti penuh.
 * - Price list berkode hash isinya: yang sudah ada tidak ditulis ulang; yang tidak lagi
 *   dipakai outlet mana pun dihapus.
 * - Pengaturan admin (brands.*, products.is_visible, categories.is_visible, products.image_key)
 *   tidak disentuh.
 */

export interface ImportStats {
  categories: { upserted: number; inserted: number; deactivated: number };
  optionGroups: { upserted: number; inserted: number; deactivated: number };
  options: { upserted: number; inserted: number; deactivated: number };
  products: { upserted: number; inserted: number; deactivated: number };
  productOptionGroups: number;
  priceLists: { total: number; added: number; removed: number; itemsWritten: number };
  outlets: { upserted: number; inserted: number; deactivated: number };
  outletProductStatus: number;
}

type Tx = postgres.TransactionSql;
type Row = Record<string, unknown>;

const CHUNK = 2000;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Upsert banyak baris; mengembalikan peta kunci sumber -> id dan jumlah baris baru. */
async function upsert(
  tx: Tx,
  table: string,
  rows: Row[],
  conflict: string[],
  keyColumn: string,
): Promise<{ ids: Map<string, string>; inserted: number }> {
  const ids = new Map<string, string>();
  let inserted = 0;
  if (rows.length === 0) return { ids, inserted };
  const columns = Object.keys(rows[0]);
  const updates = columns.filter((c) => !conflict.includes(c));
  for (const part of chunks(rows)) {
    const result = await tx.unsafe(
      `insert into public.${table} (${columns.join(", ")})
       select ${columns.join(", ")} from json_populate_recordset(null::public.${table}, $1::text::json)
       on conflict (${conflict.join(", ")}) do update set ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}
       returning id, ${keyColumn} as key, (xmax = 0) as inserted`,
      [JSON.stringify(part)],
    );
    for (const r of result) {
      ids.set(String(r.key), String(r.id));
      if (r.inserted) inserted++;
    }
  }
  return { ids, inserted };
}

async function insertMany(tx: Tx, table: string, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const columns = Object.keys(rows[0]);
  for (const part of chunks(rows)) {
    await tx.unsafe(
      `insert into public.${table} (${columns.join(", ")})
       select ${columns.join(", ")} from json_populate_recordset(null::public.${table}, $1::text::json)`,
      [JSON.stringify(part)],
    );
  }
  return rows.length;
}

async function deactivateMissing(tx: Tx, table: string, brandId: string, keyColumn: string, keep: string[]): Promise<number> {
  const result = await tx.unsafe(
    `update public.${table} set is_active = false
     where brand_id = $1 and is_active and not (${keyColumn} = any($2::text[]))
     returning 1`,
    [brandId, keep],
  );
  return result.length;
}

export async function importCatalog(sql: postgres.Sql, snapshot: CatalogSnapshot): Promise<ImportStats> {
  const [brand] = await sql<{ id: string }[]>`select id from public.brands where slug = ${snapshot.brand}`;
  if (!brand) throw new Error(`Brand "${snapshot.brand}" belum ada di tabel brands. Jalankan npm run db:migrate dulu.`);

  const [run] = await sql<{ id: string }[]>`
    insert into public.import_runs (brand_id, source, status) values (${brand.id}, ${snapshot.source}, 'running') returning id`;

  try {
    const stats = await sql.begin((tx) => importInTransaction(tx, brand.id, snapshot));
    await sql`update public.import_runs set status = 'success', stats = ${sql.json(JSON.parse(JSON.stringify(stats)))}, finished_at = now() where id = ${run.id}`;
    return stats;
  } catch (err) {
    await sql`update public.import_runs set status = 'failed', error = ${String(err instanceof Error ? err.message : err)}, finished_at = now() where id = ${run.id}`;
    throw err;
  }
}

async function importInTransaction(tx: Tx, brandId: string, snap: CatalogSnapshot): Promise<ImportStats> {
  // 1. Kategori
  const categories = await upsert(
    tx,
    "categories",
    snap.categories.map((c, i) => ({ brand_id: brandId, external_id: c.id, name: c.name, sort_order: i, is_active: true })),
    ["brand_id", "external_id"],
    "external_id",
  );
  const categoriesDeactivated = await deactivateMissing(tx, "categories", brandId, "external_id", snap.categories.map((c) => c.id));

  // 2. Grup opsi & opsi
  const groups = await upsert(
    tx,
    "option_groups",
    snap.optionGroups.map((g) => ({
      brand_id: brandId,
      external_id: g.id,
      name: g.name,
      selection: g.selection,
      min_select: g.min,
      max_select: g.max,
      is_active: true,
    })),
    ["brand_id", "external_id"],
    "external_id",
  );
  const groupsDeactivated = await deactivateMissing(tx, "option_groups", brandId, "external_id", snap.optionGroups.map((g) => g.id));

  const optionRows = snap.optionGroups.flatMap((g) =>
    g.options.map((o, i) => ({
      brand_id: brandId,
      group_id: groups.ids.get(g.id)!,
      external_id: o.id,
      name: o.name,
      price_delta: o.priceDelta,
      compare_at_delta: o.compareAtDelta ?? null,
      is_default: o.isDefault,
      requires_any_of: o.requiresAnyOf ?? null,
      sort_order: i,
      is_active: true,
    })),
  );
  const options = await upsert(tx, "options", optionRows, ["brand_id", "external_id"], "external_id");
  const optionsDeactivated = await deactivateMissing(tx, "options", brandId, "external_id", optionRows.map((o) => o.external_id));

  // 3. Produk
  const products = await upsert(
    tx,
    "products",
    snap.products.map((p, i) => ({
      brand_id: brandId,
      external_id: p.id,
      category_id: categories.ids.get(p.categoryId)!,
      name: p.name,
      description: p.description ?? null,
      image_source_url: p.imageUrl ?? null,
      sort_order: i,
      is_active: true,
    })),
    ["brand_id", "external_id"],
    "external_id",
  );
  const productsDeactivated = await deactivateMissing(tx, "products", brandId, "external_id", snap.products.map((p) => p.id));

  // 4. Relasi produk - grup opsi (diganti penuh)
  await tx`delete from public.product_option_groups pog using public.products p
           where pog.product_id = p.id and p.brand_id = ${brandId}`;
  const productOptionGroups = await insertMany(
    tx,
    "product_option_groups",
    snap.products.flatMap((p) =>
      p.optionGroupIds.map((gid, i) => ({ product_id: products.ids.get(p.id)!, group_id: groups.ids.get(gid)!, sort_order: i })),
    ),
  );

  // 5. Price list: hanya yang belum ada yang ditulis (kode = hash isi)
  const existing = new Map(
    (await tx<{ id: string; code: string }[]>`select id, code from public.price_lists where brand_id = ${brandId}`).map((r) => [r.code, r.id]),
  );
  const fresh = snap.priceLists.filter((pl) => !existing.has(pl.code));
  const priceListIds = new Map(existing);
  let itemsWritten = 0;
  if (fresh.length > 0) {
    const added = await insertReturning(tx, fresh.map((pl) => ({ brand_id: brandId, code: pl.code })));
    for (const [code, id] of added) priceListIds.set(code, id);
    itemsWritten += await insertMany(
      tx,
      "price_list_items",
      fresh.flatMap((pl) =>
        Object.entries(pl.basePrices).map(([pid, price]) => ({
          price_list_id: priceListIds.get(pl.code)!,
          product_id: products.ids.get(pid)!,
          base_price: price,
          compare_at_price: pl.compareAtBasePrices[pid] ?? null,
        })),
      ),
    );
    itemsWritten += await insertMany(
      tx,
      "price_list_option_deltas",
      fresh.flatMap((pl) =>
        Object.entries(pl.optionDeltas).flatMap(([pid, deltas]) =>
          Object.entries(deltas).map(([oid, delta]) => ({
            price_list_id: priceListIds.get(pl.code)!,
            product_id: products.ids.get(pid)!,
            option_id: options.ids.get(oid)!,
            price_delta: delta,
          })),
        ),
      ),
    );
  }

  // 6. Outlet
  const outlets = await upsert(
    tx,
    "outlets",
    snap.outlets.map((o) => ({
      brand_id: brandId,
      external_code: o.code,
      name: o.name,
      city: o.city ?? null,
      address: o.address ?? null,
      lat: o.lat ?? null,
      lng: o.lng ?? null,
      open_time: o.hours?.open ?? null,
      close_time: o.hours?.close ?? null,
      price_list_id: priceListIds.get(o.priceListCode)!,
      is_active: true,
      last_synced_at: new Date().toISOString(),
    })),
    ["brand_id", "external_code"],
    "external_code",
  );
  const outletsDeactivated = await deactivateMissing(tx, "outlets", brandId, "external_code", snap.outlets.map((o) => o.code));

  // 7. Hapus price list yang tidak dipakai outlet mana pun
  const removed = await tx`
    delete from public.price_lists pl
    where pl.brand_id = ${brandId}
      and not (pl.code = any(${snap.priceLists.map((p) => p.code)}::text[]))
      and not exists (select 1 from public.outlets o where o.price_list_id = pl.id)
    returning 1`;

  // 8. Status produk per outlet (diganti penuh)
  await tx`delete from public.outlet_product_status ops using public.outlets o
           where ops.outlet_id = o.id and o.brand_id = ${brandId}`;
  const outletProductStatus = await insertMany(
    tx,
    "outlet_product_status",
    snap.availability.map((a) => ({
      outlet_id: outlets.ids.get(a.outletCode)!,
      product_id: products.ids.get(a.productId)!,
      status: a.status,
    })),
  );

  return {
    categories: { upserted: snap.categories.length, inserted: categories.inserted, deactivated: categoriesDeactivated },
    optionGroups: { upserted: snap.optionGroups.length, inserted: groups.inserted, deactivated: groupsDeactivated },
    options: { upserted: optionRows.length, inserted: options.inserted, deactivated: optionsDeactivated },
    products: { upserted: snap.products.length, inserted: products.inserted, deactivated: productsDeactivated },
    productOptionGroups,
    priceLists: { total: snap.priceLists.length, added: fresh.length, removed: removed.length, itemsWritten },
    outlets: { upserted: snap.outlets.length, inserted: outlets.inserted, deactivated: outletsDeactivated },
    outletProductStatus,
  };
}

async function insertReturning(tx: Tx, rows: Array<{ brand_id: string; code: string }>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const part of chunks(rows)) {
    const result = await tx.unsafe(
      `insert into public.price_lists (brand_id, code)
       select brand_id, code from json_populate_recordset(null::public.price_lists, $1::text::json)
       returning id, code`,
      [JSON.stringify(part)],
    );
    for (const r of result) ids.set(String(r.code), String(r.id));
  }
  return ids;
}
