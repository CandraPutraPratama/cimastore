import type { BrandImporter } from "../registry";
import { buildStoreMenuSnapshot } from "../store-menu-format";
import { cleanText } from "../shared";

/**
 * Chagee: menu master + harga & stok per outlet.
 * Alamat di data sumber kadang diawali promosi ("🍰 Tea Financier | 📍Jl. ..."), dibuang.
 * Foto di data sumber disimpan di server pihak ketiga, jadi tidak dipakai.
 */
export const chageeImporter: BrandImporter = {
  brand: "chagee",
  files: {
    products: "chagee_menu_master.json",
    outlets: "chagee_outlets.json",
    outletMenus: "chagee_outlets_with_menus.json",
  },
  build: (raw, generatedAt) =>
    buildStoreMenuSnapshot(raw, {
      brand: "chagee",
      source: "data pemilik: chagee_menu_master.json + chagee_outlets_with_menus.json",
      generatedAt,
      priceListPrefix: "cg",
      cleanAddress: (address) => cleanText(address.includes("📍") ? address.slice(address.lastIndexOf("📍") + 2) : address),
      blockedImageHosts: ["akzara.id"],
    }),
};
