/**
 * Membuat CatalogSnapshot dari data mentah satu brand lalu memvalidasinya.
 *
 *   npm run snapshot -- <brand> <folder-data-mentah> [file-output]
 *   npm run snapshot -- chagee ./Chagee
 *
 * Output default: .snapshots/<brand>.json (tidak masuk git).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CatalogSnapshotSchema } from "../src/core/catalog/snapshot";
import { importers } from "../src/brands/registry";

async function main() {
  const [brand, rawDir, outArg] = process.argv.slice(2);
  const importer = brand ? importers[brand] : undefined;
  if (!importer || !rawDir) {
    console.error(`Pemakaian: npm run snapshot -- <brand> <folder-data> [output]\nBrand: ${Object.keys(importers).join(", ")}`);
    process.exit(1);
  }

  const raw: Record<string, unknown> = {};
  for (const [key, file] of Object.entries(importer.files)) {
    raw[key] = JSON.parse(await readFile(path.join(rawDir, file), "utf8"));
  }

  const { snapshot, report } = importer.build(raw, new Date().toISOString());
  const parsed = CatalogSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    console.error("Snapshot TIDAK valid:");
    for (const issue of parsed.error.issues.slice(0, 30)) console.error(` - ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }

  const out = outArg ?? path.join(".snapshots", `${brand}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(parsed.data, null, 1));

  console.log(`Snapshot ${brand} valid -> ${out}`);
  for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k}: ${v}`);
  for (const w of report.warnings) console.log(`  ! ${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
