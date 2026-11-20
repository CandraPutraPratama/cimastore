import type { CatalogSnapshotInput } from "../core/catalog/snapshot";
import { chageeImporter } from "./chagee/importer";
import { chatimeImporter } from "./chatime/importer";
import { foreImporter } from "./fore/importer";
import { kopiKenanganImporter } from "./kopi-kenangan/importer";
import type { ImportReport } from "./shared";

/**
 * Importer = fungsi murni dari data mentah (JSON yang sudah dibaca) ke CatalogSnapshot.
 * `files` memetakan nama input ke nama file di folder data mentah brand.
 * `dirs` (opsional) memetakan nama input ke subfolder berisi banyak file JSON;
 * hasilnya objek { "<nama file>": isi } untuk file yang cocok dengan `pattern`.
 */
export interface BrandImporter {
  brand: string;
  files: Record<string, string>;
  dirs?: Record<string, { dir: string; pattern: RegExp }>;
  build(raw: Record<string, unknown>, generatedAt: string): { snapshot: CatalogSnapshotInput; report: ImportReport };
}

export const importers: Record<string, BrandImporter> = {
  [chageeImporter.brand]: chageeImporter,
  [chatimeImporter.brand]: chatimeImporter,
  [kopiKenanganImporter.brand]: kopiKenanganImporter,
  [foreImporter.brand]: foreImporter,
};
