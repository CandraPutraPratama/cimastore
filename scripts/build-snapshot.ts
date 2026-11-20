/**
 * Membuat CatalogSnapshot dari data mentah satu brand lalu memvalidasinya (tanpa database).
 *
 *   npm run snapshot -- <brand> [folder-data-mentah] [file-output]
 *   npm run snapshot -- chagee
 *
 * Output default: .snapshots/<brand>.json (tidak masuk git).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSnapshotFromDir, DEFAULT_RAW_DIRS, printReport } from "./lib/snapshot";

async function main() {
  const [brand, rawDirArg, outArg] = process.argv.slice(2);
  if (!brand) {
    console.error(`Pemakaian: npm run snapshot -- <brand> [folder-data] [output]\nBrand: ${Object.keys(DEFAULT_RAW_DIRS).join(", ")}`);
    process.exit(1);
  }
  const rawDir = rawDirArg ?? DEFAULT_RAW_DIRS[brand];
  const { snapshot, report } = await buildSnapshotFromDir(brand, rawDir);
  const out = outArg ?? path.join(".snapshots", `${brand}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(snapshot, null, 1));
  console.log(`Snapshot ${brand} valid -> ${out}`);
  printReport(report);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
