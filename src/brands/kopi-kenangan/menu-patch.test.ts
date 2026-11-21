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
  return { menus };
};

describe("tier outlet", () => {
  it("ditentukan per outlet, bukan dari kategori; default normal", () => {
    expect(kkTierOf("LIPPO-PURI")).toBe("mall");
    expect(kkTierOf("TNG.SOETTA2")).toBe("bandara");
    expect(kkTierOf("SMS")).toBe("normal");
    expect(kkTierOf("MDN.KUALANAMU")).toBe("normal");
    expect(kkTierOf("OUTLET.TIDAK.DIKENAL")).toBe("normal");
    expect(kkTierOf("BDG.CHMPLSWK")).toBe("mall");
    expect(kkTierOf("JKT.GANDCITY")).toBe("bandara");
  });
});

describe("koreksi menu Kopi Kenangan", () => {
  it("mengoreksi harga yang meleset tanpa menyentuh harga lain", () => {
    const { menus } = setup();
    applyKkMenuPatch(menus);
    expect(menus.get("MSC")!.get(1)!.item).toMatchObject({ price: 15000, originalPrice: null });
    expect(menus.get("AEON.BSD")!.get(1)!.item.price).toBe(18000);
    expect(menus.get("TNG.SOETTA2")!.get(1)!.item.price).toBe(30000);
    expect(menus.get("MSC")!.get(2)!.item.price).toBe(12000);
  });

  it("harga benar absolut per tier, apa pun harga awalnya", () => {
    const menus = new Map<string, PatchMenu>([
      ["SMS", new Map([entry(1, "Americano", 20000, "Coffee")])],
      ["MDN.KUALANAMU", new Map([entry(1, "Americano", 30000, "Coffee")])],
      ["LIPPO-PURI", new Map([entry(1, "Americano", 20000, "Coffee")])],
      ["BDG.CHMPLSWK", new Map([entry(1, "Americano", 20000, "Coffee")])],
      ["JKT.GANDCITY", new Map([entry(1, "Americano", 30000, "Coffee")])],
      ["BIASA", new Map([entry(1, "Americano", 20000, "Coffee")])],
      ["TNG.SOETTA2", new Map([entry(1, "Americano", 30000, "Coffee")])],
    ]);
    applyKkMenuPatch(menus);
    expect(menus.get("SMS")!.get(1)!.item.price).toBe(15000);
    expect(menus.get("MDN.KUALANAMU")!.get(1)!.item.price).toBe(15000);
    expect(menus.get("BIASA")!.get(1)!.item.price).toBe(15000);
    expect(menus.get("LIPPO-PURI")!.get(1)!.item.price).toBe(18000);
    expect(menus.get("TNG.SOETTA2")!.get(1)!.item.price).toBe(30000);
    expect(menus.get("BDG.CHMPLSWK")!.get(1)!.item.price).toBe(18000);
    expect(menus.get("JKT.GANDCITY")!.get(1)!.item.price).toBe(30000);
  });

  it("produk baru memakai tier outlet, bukan kategorinya", () => {
    const menus = new Map<string, PatchMenu>([["SMS", new Map()], ["LIPPO-PURI", new Map()], ["MDN.KUALANAMU", new Map()], ["TNG.SOETTA2", new Map()]]);
    applyKkMenuPatch(menus);
    const price = (code: string) => [...menus.get(code)!.values()].find((e) => e.item.name === "Thai Tea")?.item.price;
    expect([price("SMS"), price("MDN.KUALANAMU"), price("LIPPO-PURI"), price("TNG.SOETTA2")]).toEqual([22000, 22000, 22000, 34000]);
  });

  it("koreksi dengan tier hanya berlaku di tier itu", () => {
    const { menus } = setup();
    applyKkMenuPatch(menus);
    expect(menus.get("TNG.SOETTA2")!.get(3)!.item.price).toBe(27000);
    expect(menus.get("MSC")!.get(3)!.item.price).toBe(25000);
  });

  it("menambah produk lama ke outlet yang disebut dengan harga resmi", () => {
    const { menus } = setup();
    menus.get("TNG.SOETTA2")!.delete(4);
    menus.get("MSC")!.set(...entry(4, "Roti Susu Manis", 10000));
    applyKkMenuPatch(menus);
    expect(menus.get("TNG.SOETTA2")!.get(4)!.item.price).toBe(15000);
    expect(menus.get("AEON.BSD")!.has(4)).toBe(false);
  });

  it("produk baru per tier masuk semua outlet, produk per outlet hanya di outlet itu", () => {
    const { menus } = setup();
    const result = applyKkMenuPatch(menus);
    const byName = (code: string, name: string) => [...menus.get(code)!.values()].find((e) => e.item.name === name)?.item.price;
    expect(byName("MSC", "Thai Tea")).toBe(22000);
    expect(byName("AEON.BSD", "Thai Tea")).toBe(22000);
    expect(byName("TNG.SOETTA2", "Thai Tea")).toBe(34000);
    expect(byName("MSC", "Archipelago Blend")).toBe(95000);
    expect(byName("AEON.BSD", "Archipelago Blend")).toBeUndefined();
    expect(byName("TNG.SOETTA2", "Pain au Chocolat")).toBe(35000);
    expect(byName("MSC", "Pain au Chocolat")).toBeUndefined();
    expect(result.newProducts.filter((p) => p.name !== "Friend-chip Cookie").every((p) => p.id >= KK_NEW_PRODUCT_ID_BASE)).toBe(true);
    expect(new Set(result.newProducts.map((p) => p.id)).size).toBe(result.newProducts.length);
  });

  it("Friend-chip Cookie bandara adalah produk sendiri (id 8122), bukan Friend Chip Cookie (id 1261)", () => {
    const { menus } = setup();
    menus.get("MSC")!.set(...entry(1261, "Friend Chip Cookie", 17000));
    menus.get("TNG.SOETTA2")!.set(...entry(1261, "Friend Chip Cookie", 17000));
    menus.get("TNG.SOETTA2")!.delete(1261);
    applyKkMenuPatch(menus);
    const tng = menus.get("TNG.SOETTA2")!;
    expect(tng.get(8122)!.item).toMatchObject({ name: "Friend-chip Cookie", price: 25000 });
    expect([...tng.values()].some((e) => e.item.name === "Friend Chip Cookie" || e.item.id === 1261)).toBe(false);
    expect(menus.get("MSC")!.get(1261)!.item.price).toBe(19000);
    expect(menus.get("MSC")!.has(8122)).toBe(false);
  });

  it("tidak menambah Seliter dan Merch", () => {
    const { menus } = setup();
    const { newProducts } = applyKkMenuPatch(menus);
    expect(newProducts.some((p) => /seliter|tumbler|kaos/i.test(p.name))).toBe(false);
  });
});
