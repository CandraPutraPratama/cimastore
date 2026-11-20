import { describe, expect, it } from "vitest";
import { CatalogSnapshotSchema } from "../../core/catalog/snapshot";
import { resolveProductFromSnapshot } from "../../core/catalog/resolve";
import { buildForeSnapshot, foreKey, parseForeHours } from "./importer";

const drink = {
  hasCustomization: true,
  canIce: true,
  canHot: true,
  sizes: { regular: true, large: true },
  iceOptions: ["Normal Ice", "Less Ice"],
  sweetnessOptions: ["Normal Sweet", "Less Sweet"],
  espressoOptions: [],
  dairyOptions: [
    { name: "Milk", price: 0 },
    { name: "Oat Milk", price: 15000 },
  ],
  syrupOptions: [{ name: "Aren", price: 7000 }],
  toppingOptions: [],
};

const raw = {
  outlets: [
    { id: 1, code: "SNP", name: "Senopati", address: "Fore Coffee Senopati - Jl. Senopati 1", openHours: "07:00 - 23:00 WIB", lat: -6.2, lng: 106.8 },
    { id: 2, code: "KSG", name: "Kosong", openHours: "-" },
  ],
  customization: {
    largeAddition: 7000,
    products: {
      "café latte": { nama: "Café Latte", ...drink },
      "butter croissant": { nama: "Butter Croissant", ...drink, hasCustomization: false, sizes: { regular: false, large: false } },
    },
  },
  menus: {
    "menu_fore_1.json": {
      categories: [
        { categoryName: "Coffee", items: [
          { id: 10, name: "Iced Café Latte", price: 29000, normalPrice: 29000 },
          { id: 11, name: "Hot Café Latte", price: 29000, normalPrice: 29000 },
          { id: 13, name: "Iced Dirty Latte", price: 31000 },
        ] },
        { categoryName: "Coffee of The Day", items: [{ id: 12, name: "Iced Aceh Gayo", price: 25000 }] },
        { categoryName: "Fore Deli", items: [{ id: 20, name: "Butter Croissant", price: 22000 }, { id: 21, name: "Cempedak Cake", price: 30000 }] },
        { categoryName: "Merchandise", items: [{ id: 30, name: "Tumbler", price: 150000 }] },
      ],
    },
    "menu_fore_2.json": { categories: [] },
  },
};

describe("importer Fore", () => {
  const { snapshot, report } = buildForeSnapshot(raw, "2026-11-20T12:00:00+07:00");
  const snap = CatalogSnapshotSchema.parse(snapshot);

  it("menjual minuman berkustomisasi dan makanan, melewatkan merchandise", () => {
    expect(snap.products.map((p) => p.name).sort()).toEqual(["Butter Croissant", "Cempedak Cake", "Hot Café Latte", "Iced Café Latte"]);
    expect(report.warnings.join("\n")).toContain("Iced Dirty Latte (1 outlet)");
    expect(report.warnings.join("\n")).not.toContain("Aceh Gayo");
    expect(report.warnings.join("\n")).toContain("Outlet Kosong dilewati");
    expect(snap.outlets).toEqual([
      { code: "SNP", name: "Senopati", address: "Jl. Senopati 1", lat: -6.2, lng: 106.8, hours: { open: "07:00", close: "23:00" }, priceListCode: "fr-1" },
    ]);
  });

  it("pilihan es hanya untuk produk Iced; Large +7.000", () => {
    const iced = resolveProductFromSnapshot(snap, "SNP", "10")!;
    const hot = resolveProductFromSnapshot(snap, "SNP", "11")!;
    expect(iced.optionGroups.map((g) => g.name)).toEqual(["Ukuran", "Es", "Manis", "Susu", "Syrup"]);
    expect(hot.optionGroups.map((g) => g.name)).toEqual(["Ukuran", "Manis", "Susu", "Syrup"]);
    expect(iced.optionGroups[0].options[1]).toMatchObject({ name: "Large", priceDelta: 7000 });
    expect(resolveProductFromSnapshot(snap, "SNP", "20")!.optionGroups).toEqual([]);
  });
});

describe("helper Fore", () => {
  it("mencocokkan nama tanpa awalan Iced/Hot dan aksen", () => {
    expect(foreKey("Iced Café Latte")).toEqual({ key: "cafe latte", temperature: "iced" });
    expect(foreKey("Iced Nutty Oat  Latte")).toEqual({ key: "nutty oat latte", temperature: "iced" });
    expect(foreKey("Espresso")).toEqual({ key: "espresso", temperature: null });
  });

  it("membaca jam buka", () => {
    expect(parseForeHours("06:30 - 23:00 WIB")).toEqual({ open: "06:30", close: "23:00" });
    expect(parseForeHours("24 jam")).toBeNull();
  });
});
