import type { BrandImporter } from "../registry";
import { buildStoreMenuSnapshot } from "../store-menu-format";
import { cleanText } from "../shared";

/**
 * Chatime: satu menu master untuk semua outlet (belum ada harga per outlet).
 * Nama outlet di sumber berbentuk "Chatime - ST CHATIME AEON BSD" -> "AEON BSD".
 */
export const chatimeImporter: BrandImporter = {
  brand: "chatime",
  files: {
    products: "chatime_menu_master.json",
    outlets: "chatime_outlets.json",
  },
  build: (raw, generatedAt) =>
    buildStoreMenuSnapshot(raw, {
      brand: "chatime",
      source: "data pemilik: chatime_menu_master.json + chatime_outlets.json",
      generatedAt,
      priceListPrefix: "ct",
      cleanOutletName: (name) =>
        cleanText(name.replace(/^chatime\s*-\s*/i, "").replace(/^(st\s+)?chatime\s+/i, "")) ?? name,
      ignoredCities: ["Lainnya"],
      blockedImageHosts: ["akzara.id"],
    }),
};
