/**
 * Membaca data mentah brand, membuat snapshot, lalu memasukkannya ke database.
 *
 *   npm run db:import -- <brand> [folder-data-mentah]
 *   npm run db:import -- kopi-kenangan
 *   npm run db:import -- --all
 *
 * Tiap brand diimport dalam satu transaksi: kalau gagal, data brand itu tidak berubah sama sekali.
 */
import { importCatalog } from "../src/server/db/import-catalog";
import { connect } from "./lib/db";
import { buildSnapshotFromDir, DEFAULT_RAW_DIRS, printReport } from "./lib/snapshot";

async function main() {
  const args = process.argv.slice(2);
  const targets: Array<[string, string]> =
    args[0] === "--all"
      ? Object.entries(DEFAULT_RAW_DIRS)
      : args[0]
        ? [[args[0], args[1] ?? DEFAULT_RAW_DIRS[args[0]]]]
        : [];
  if (targets.length === 0) {
    console.error(`Pemakaian: npm run db:import -- <brand> [folder-data]   atau   npm run db:import -- --all
Brand: ${Object.keys(DEFAULT_RAW_DIRS).join(", ")}`);
    process.exit(1);
  }

  const { sql, target } = connect();
  console.log(`Database: ${target}`);
  let failed = 0;
  try {
    for (const [brand, dir] of targets) {
      console.log(`\n== ${brand} (${dir})`);
      try {
        const started = Date.now();
        const { snapshot, report } = await buildSnapshotFromDir(brand, dir);
        printReport(report);
        const stats = await importCatalog(sql, snapshot);
        const s = stats;
        console.log(
          `  -> database: ${s.outlets.upserted} outlet (${s.outlets.inserted} baru, ${s.outlets.deactivated} nonaktif), ` +
            `${s.products.upserted} produk (${s.products.inserted} baru, ${s.products.deactivated} nonaktif), ` +
            `${s.priceLists.total} price list (${s.priceLists.added} baru, ${s.priceLists.removed} dihapus, ${s.priceLists.itemsWritten} baris harga ditulis), ` +
            `${s.outletProductStatus} status produk per outlet. ${((Date.now() - started) / 1000).toFixed(1)} detik.`,
        );
      } catch (err) {
        failed++;
        console.error(`  GAGAL: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await sql.end();
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`GAGAL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
