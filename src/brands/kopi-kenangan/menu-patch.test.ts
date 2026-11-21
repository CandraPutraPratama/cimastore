import { describe, expect, it } from "vitest";
import { applyKkMenuPatch, kkTierOf, KK_NEW_PRODUCT_ID_BASE, type PatchMenu } from "./menu-patch";

const entry = (id: number, name: string, price: number, cat = "Food") => [
  id,
  { item: { id, name, price, originalPrice: price }, categories: new Set([cat]) },
] as const;

const setup = () => {
  const menus = new Map<string, PatchMenu>([
    ["MSC", new Map([entry(1, "Americano", 17000, "Coffee"), entry(2, "Roti Keju Manis", 13000), entry(3, "Butter Croissant", 25000)])],
    ["AEON.BSD", new Map([entry(1, "Americano", 20000, "Coffee"), entry(3, "Butter Croissant", 25000)])],
    ["TNG.SOETTA2", new Map([entry(1, "Americano", 30000, "Coffee"), entry(3, "Butter Croissant", 25000), entry(4, "Roti Susu Manis", 10000)])],
  ]);
  const categories = new Map([["MSC", "Office"], ["AEON.BSD", "Mall"], ["TNG.SOETTA2", "Airport"]]);
  return { menus, categories };
};

describe("tier outlet", () => {
  it("diturunkan dari kategori outlet", () => {
    expect(kkTierOf("Airport")).toBe("bandara");
    expect(kkTierOf("Mall")).toBe("mall");
    expect(kkTierOf("Shop House")).toBe("normal");
    expect(kkTierOf(null)).toBe("normal");
  });
});

describe("koreksi menu Kopi Kenangan", () => {
  it("mengoreksi harga yang meleset tanpa menyentuh harga lain", () => {
    const { menus, categories } = setup();
    applyKkMenuPatch(menus, categories);
    expect(menus.get("MSC")!.get(1)!.item).toMatchObject({ price: 15000, originalPrice: null });
    expect(menus.get("AEON.BSD")!.get(1)!.item.price).toBe(18000);
    expect(menus.get("TNG.SOETTA2")!.get(1)!.item.price).toBe(30000);
    expect(menus.get("MSC")!.get(2)!.item.price).toBe(12000);
  });

  it("koreksi dengan tier hanya berlaku di tier itu", () => {
    const { menus, categories } = setup();
    applyKkMenuPatch(menus, categories);
    expect(menus.get("TNG.SOETTA2")!.get(3)!.item.price).toBe(27000);
    expect(menus.get("MSC")!.get(3)!.item.price).toBe(25000);
  });

  it("menambah produk lama ke outlet yang disebut dengan harga resmi", () => {
    const { menus, categories } = setup();
    menus.get("TNG.SOETTA2")!.delete(4);
    menus.get("MSC")!.set(...entry(4, "Roti Susu Manis", 10000));
    applyKkMenuPatch(menus, categories);
    expect(menus.get("TNG.SOETTA2")!.get(4)!.item.price).toBe(15000);
    expect(menus.get("AEON.BSD")!.has(4)).toBe(false);
  });

  it("produk baru per tier masuk semua outlet, produk per outlet hanya di outlet itu", () => {
    const { menus, categories } = setup();
    const result = applyKkMenuPatch(menus, categories);
    const byName = (code: string, name: string) => [...menus.get(code)!.values()].find((e) => e.item.name === name)?.item.price;
    expect(byName("MSC", "Thai Tea")).toBe(22000);
    expect(byName("AEON.BSD", "Thai Tea")).toBe(22000);
    expect(byName("TNG.SOETTA2", "Thai Tea")).toBe(34000);
    expect(byName("MSC", "Archipelago Blend")).toBe(95000);
    expect(byName("AEON.BSD", "Archipelago Blend")).toBeUndefined();
    expect(byName("TNG.SOETTA2", "Pain au Chocolat")).toBe(35000);
    expect(byName("MSC", "Pain au Chocolat")).toBeUndefined();
    expect(result.newProducts.every((p) => p.id >= KK_NEW_PRODUCT_ID_BASE)).toBe(true);
  });

  it("tidak menambah Seliter dan Merch", () => {
    const { menus, categories } = setup();
    const { newProducts } = applyKkMenuPatch(menus, categories);
    expect(newProducts.some((p) => /seliter|tumbler|kaos/i.test(p.name))).toBe(false);
  });
});
