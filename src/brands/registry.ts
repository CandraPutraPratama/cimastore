import type { CatalogSnapshotInput } from "../core/catalog/snapshot";
import { chageeImporter } from "./chagee/importer";
import { chatimeImporter } from "./chatime/importer";
import type { ImportReport } from "./shared";

/**
 * Importer = fungsi murni dari data mentah (JSON yang sudah dibaca) ke CatalogSnapshot.
 * `files` memetakan nama input ke nama file di folder data mentah brand.
 */
export interface BrandImporter {
  brand: string;
  files: Record<string, string>;
  build(raw: Record<string, unknown>, generatedAt: string): { snapshot: CatalogSnapshotInput; report: ImportReport };
}

export const importers: Record<string, BrandImporter> = {
  [chageeImporter.brand]: chageeImporter,
  [chatimeImporter.brand]: chatimeImporter,
};
