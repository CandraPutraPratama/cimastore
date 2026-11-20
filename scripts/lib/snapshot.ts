import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "../../src/core/catalog/snapshot";
import { importers } from "../../src/brands/registry";
import type { ImportReport } from "../../src/brands/shared";

/** Folder data mentah default per brand (relatif ke root proyek). */
export const DEFAULT_RAW_DIRS: Record<string, string> = {
  "kopi-kenangan": "Kopi Kenangan",
  fore: "Fore",
  chagee: "Chagee",
  chatime: "Chatime",
};

/** Membaca data mentah brand dari folder, menjalankan importer, dan memvalidasi hasilnya. */
export async function buildSnapshotFromDir(
  brand: string,
  rawDir: string,
): Promise<{ snapshot: CatalogSnapshot; report: ImportReport }> {
  const importer = importers[brand];
  if (!importer) throw new Error(`Brand tidak dikenal: ${brand}. Pilihan: ${Object.keys(importers).join(", ")}`);

  const raw: Record<string, unknown> = {};
  for (const [key, file] of Object.entries(importer.files)) {
    raw[key] = JSON.parse(await readFile(path.join(rawDir, file), "utf8"));
  }
  for (const [key, { dir, pattern }] of Object.entries(importer.dirs ?? {})) {
    const entries: Record<string, unknown> = {};
    for (const name of (await readdir(path.join(rawDir, dir))).sort()) {
      if (pattern.test(name)) entries[name] = JSON.parse(await readFile(path.join(rawDir, dir, name), "utf8"));
    }
    raw[key] = entries;
  }

  const { snapshot, report } = importer.build(raw, new Date().toISOString());
  const parsed = CatalogSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 30)
      .map((i) => ` - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Snapshot ${brand} TIDAK valid:\n${issues}`);
  }
  return { snapshot: parsed.data, report };
}

export function printReport(report: ImportReport): void {
  for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k}: ${v}`);
  for (const w of report.warnings) console.log(`  ! ${w.length > 300 ? `${w.slice(0, 300)}...` : w}`);
}
