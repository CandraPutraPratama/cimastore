import { describe, expect, it } from "vitest";
import { CatalogSnapshotSchema } from "../../core/catalog/snapshot";
import { defaultOptionIds, resolveProductFromSnapshot } from "../../core/catalog/resolve";
import { priceLine } from "../../core/catalog/selection";
import { buildKopiKenanganSnapshot, isExcludedKkOutlet, isHiddenKkProduct } from "./importer";

const addons = [
  { name: "Vanilla Syrup", price: 6000 },
  { name: "Choco Sauce", price: 6000 },
  { name: "Golden Boba", price: 6000 },
  { name: "Whipped Cream Vanilla", price: 6000 },
];

const combos = (base: number) => [
  { description: "Ice, Regular, Kenangan Blend, Milk, Normal Sugar", price: base },
  { description: "Ice, Large, Kenangan Blend, Milk, Normal Sugar", price: base + 6000 },
  { description: "Ice, Regular, Juwara Beans, Milk, Normal Sugar", price: base + 3000 },
  { description: "Ice, Regular, Kenangan Blend, Oatside, Normal Sugar", price: base + 3000 },
];

const customization = {
  products: {
    "1": {
      productId: 1,
      name: "Kopi Kenangan Mantan",
      options: {
        temperatures: ["Ice", "Hot"],
        sizes: ["Regular", "Large", "Jumbo"],
        sugarLevels: ["No Sugar", "Normal Sugar", "Less Sugar"],
        coffeeBeans: ["Kenangan Blend", "Juwara Beans"],
        dairyChoices: ["Milk", "Oatside"],
        iceLevels: ["Normal Ice", "Less Ice"],
      },
      addons,
      combinations: combos(22000),
    },
    "2": {
      productId: 2,
      name: "Mantan Frappe",
      options: { temperatures: ["Ice"], sizes: ["Regular", "Large"], sugarLevels: [], coffeeBeans: [], dairyChoices: [], iceLevels: ["Normal Ice"] },
      addons,
      combinations: [],
    },
    // Data sumber menempelkan add-on minuman ke roti: harus diabaikan.
    "6": {
      productId: 6,
      name: "Chocolate Croissant",
      options: { temperatures: [], sizes: [], sugarLevels: [], coffeeBeans: [], dairyChoices: [], iceLevels: [] },
      addons,
      combinations: [],
    },
    // ID berbeda dengan menu (99 vs 3), dicocokkan lewat nama.
    "99": {
      productId: 99,
      name: "Americano",
      options: { temperatures: ["Ice"], sizes: [], sugarLevels: [], coffeeBeans: [], dairyChoices: [], iceLevels: [] },
      addons: [],
      combinations: [],
    },
  },
};

const item = (id: number, name: string, price: number, extra: object = {}) => ({ id, name, price, originalPrice: price, image: `https://cdn.kopikenangan.com/${id}.jpg`, ...extra });

const menu = (items: { cat: string; list: object[] }[]) => ({ categories: items.map((c) => ({ categoryName: c.cat, items: c.list })) });

const raw = {
  outlets: [
    { id: 10, code: "LIPPO-PURI", name: "Lippo Mall Puri", address: "Jl. Puri Indah", hours: { open: "10:00:00", close: "21:45:00" }, coordinates: { lat: "-6.18", lng: "106.73" } },
    { id: 11, code: "BANDARA", name: "Bandara", hours: null, coordinates: { lat: "0", lng: "0" } },
    { id: 12, code: "KS.JKT.AGRMALL", name: "Kenangan Signature Agora Mall" },
    { id: 13, code: "KOSONG", name: "Outlet Kosong" },
  ],
  customization,
  menus: {
    "menu_10.json": menu([
      { cat: "Baru!", list: [item(1, "Kopi Kenangan Mantan", 22000)] },
      { cat: "Coffee", list: [item(1, "Kopi Kenangan Mantan", 22000), item(3, "Americano", 18000), item(4, "Mocha Latte", 25000), item(5, "Seliter Kenangan - Latte", 100000)] },
      { cat: "Kenangan Frappe", list: [item(2, "Mantan Frappe", 31000, { isSoldOut: true })] },
      { cat: "Food", list: [item(6, "Chocolate Croissant", 19000)] },
      { cat: "ChiMate", list: [item(7, "Chicken Burger", 30000)] },
    ]),
    "menu_11.json": menu([{ cat: "Coffee", list: [item(1, "Kopi Kenangan Mantan", 32000)] }]),
    "menu_12.json": menu([{ cat: "Coffee", list: [item(1, "Kopi Kenangan Mantan", 22000)] }]),
    "menu_13.json": { categories: [] },
  },
};

const build = () => buildKopiKenanganSnapshot(raw, "2026-11-20T12:00:00+07:00");

describe("importer Kopi Kenangan", () => {
  it("menyaring outlet, produk, dan melaporkan kekurangan data", () => {
    const { snapshot, report } = build();
    const snap = CatalogSnapshotSchema.parse(snapshot);
    expect(snap.outlets.map((o) => o.code)).toEqual(["LIPPO-PURI", "BANDARA"]);
    expect(snap.products.map((p) => p.name).sort()).toEqual(["Americano", "Chocolate Croissant", "Kopi Kenangan Mantan", "Mantan Frappe"]);
    expect(report.counts).toMatchObject({ hiddenByRule: 1, missingCustomization: 1 });
    expect(report.warnings.join("\n")).toContain("Mocha Latte (1 outlet)");
    expect(report.warnings.join("\n")).toContain("1 outlet Kenangan Signature/Heritage/Chigo");
    expect(report.warnings.join("\n")).toContain("1 produk dicocokkan ke data kustomisasi lewat nama");
    expect(snap.categories.map((c) => c.id)).toEqual(["Baru!", "Coffee", "Kenangan Frappe", "Food"]);
    expect(snap.products.find((p) => p.name === "Kopi Kenangan Mantan")!.categoryId).toBe("Baru!");
  });

  it("opsi minuman: harga flat jasdor, harga asli dari kombinasi SKU, Jumbo dibuang", () => {
    const snap = CatalogSnapshotSchema.parse(build().snapshot);
    const mantan = resolveProductFromSnapshot(snap, "LIPPO-PURI", "1")!;
    const groups = Object.fromEntries(mantan.optionGroups.map((g) => [g.name, g]));
    expect(Object.keys(groups)).toEqual(["Suhu", "Ukuran", "Beans", "Susu", "Gula", "Es", "Syrup", "Topping"]);
    expect(groups.Ukuran.options.map((o) => [o.name, o.priceDelta, o.compareAtDelta])).toEqual([
      ["Regular", 0, undefined],
      ["Large", 5000, 6000],
    ]);
    expect(groups.Beans.options[1]).toMatchObject({ name: "Juwara Beans", priceDelta: 3000, compareAtDelta: 3000 });
    expect(groups.Susu.options[1]).toMatchObject({ name: "Oatside", priceDelta: 3000 });
    expect(groups.Gula.options.map((o) => o.name)).toEqual(["Normal Sugar", "Less Sugar", "No Sugar"]);
    expect(groups.Syrup.options.map((o) => o.name)).toEqual(["Vanilla Syrup", "Choco Sauce"]);
    expect(groups.Topping.options.map((o) => o.name)).toEqual(["Golden Boba", "Whipped Cream Vanilla"]);

    const ice = groups.Suhu.options.find((o) => o.name === "Ice")!;
    expect(groups.Es.min).toBe(0);
    expect(groups.Es.options.every((o) => o.requiresAnyOf?.[0] === ice.id)).toBe(true);
    expect(priceLine(mantan, { productId: "1", quantity: 1, optionIds: defaultOptionIds(mantan) }).ok).toBe(true);
  });

  it("Frappe: whipped cream gratis pilih 1, es wajib karena tidak ada Hot", () => {
    const snap = CatalogSnapshotSchema.parse(build().snapshot);
    const frappe = resolveProductFromSnapshot(snap, "LIPPO-PURI", "2")!;
    const whipped = frappe.optionGroups.find((g) => g.name === "Whipped Cream")!;
    expect(whipped.options.map((o) => [o.name, o.priceDelta])).toEqual([
      ["No Whipped Cream", 0],
      ["Whipped Cream Vanilla", 0],
    ]);
    expect(frappe.optionGroups.find((g) => g.name === "Es")!.min).toBe(1);
    expect(frappe.status).toBe("sold_out");
  });

  it("harga per outlet, produk yang tidak dijual di outlet disembunyikan", () => {
    const { snapshot } = build();
    const snap = CatalogSnapshotSchema.parse(snapshot);
    expect(resolveProductFromSnapshot(snap, "BANDARA", "1")!.basePrice).toBe(32000);
    expect(resolveProductFromSnapshot(snap, "BANDARA", "6")!.status).toBe("hidden");
    expect(resolveProductFromSnapshot(snap, "LIPPO-PURI", "6")!.optionGroups).toEqual([]);
    const bandara = snap.outlets.find((o) => o.code === "BANDARA")!;
    expect(bandara.lat).toBeUndefined();
    expect(snap.outlets[0].hours).toEqual({ open: "10:00", close: "21:45" });
  });
});

describe("aturan lingkup KK", () => {
  it("outlet dan produk yang tidak dilayani", () => {
    expect(isExcludedKkOutlet({ code: "KH.JKT.X", name: "x" })).toBe(true);
    expect(isExcludedKkOutlet({ code: "JKT.X", name: "Chigo x Flip Tangcity" })).toBe(true);
    expect(isExcludedKkOutlet({ code: "KK.BDG.X", name: "Ruko Paskal" })).toBe(false);
    expect(isExcludedKkOutlet({ code: "BREEZE", name: "The Breeze BSD", category: "Kenangan Signature" })).toBe(true);
    expect(isHiddenKkProduct("Seliter Kenangan - Latte")).toBe(true);
    expect(isHiddenKkProduct("ChiMate KrunChi Truffle Mushroom Sauce")).toBe(true);
    expect(isHiddenKkProduct("Kopi Kenangan Mantan")).toBe(false);
  });
});
