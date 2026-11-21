import { describe, expect, it } from "vitest";
import { applyKkMenuPatch, kkTierOf, KK_NEW_PRODUCTS, KK_NEW_PRODUCT_ID_BASE, type PatchMenu } from "./menu-patch";

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
      ["JKT.GANDCITY", new Map([entry(1, "Americano", 20000, "Coffee")])],
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
    expect(menus.get("JKT.GANDCITY")!.get(1)!.item.price).not.toBe(20000);
  });

  it("override per outlet (C) menimpa harga produk yang sudah ada", () => {
    const menus = new Map<string, PatchMenu>([
      ["JKT.GANDCITY", new Map([entry(5, "Latte", 24000, "Coffee")])],
      ["SMS", new Map([entry(6, "Join the Dark Side Cookie", 21000)])],
      ["DPR.BUNGURHRAI", new Map([entry(7, "Friend Chip Cookie", 22000)])],
      ["MDN.KUALANAMU", new Map([entry(5, "Latte", 32000, "Coffee")])],
    ]);
    applyKkMenuPatch(menus);
    expect(menus.get("JKT.GANDCITY")!.get(5)!.item.price).toBe(35000);
    expect(menus.get("SMS")!.get(6)!.item.price).toBe(29000);
    expect(menus.get("DPR.BUNGURHRAI")!.get(7)!.item.price).toBe(25000);
    expect(menus.get("MDN.KUALANAMU")!.get(5)!.item.price).toBe(22000);
  });

  it("harga bandara dan Kopi Kenangan Mantan", () => {
    const menus = new Map<string, PatchMenu>([
      ["TNG.SOETTA2", new Map([entry(1, "Matcha Latte", 25000, "Non Coffee"), entry(2, "Friend Chip Cookie", 17000)])],
      ["JKT.GANDCITY", new Map([entry(3, "Roti Keju Manis", 13000)])],
      ["SMS", new Map([entry(4, "Kopi Kenangan Mantan", 22000, "Coffee")])],
      ["MDN.KUALANAMU", new Map([entry(4, "Kopi Kenangan Mantan", 32000, "Coffee")])],
      ["LIPPO-PURI", new Map([entry(4, "Kopi Kenangan Mantan", 22000, "Coffee")])],
      ["TNG.T2", new Map([entry(4, "Kopi Kenangan Mantan", 19000, "Coffee")])],
    ]);
    applyKkMenuPatch(menus);
    expect(menus.get("TNG.SOETTA2")!.get(1)!.item.price).toBe(32000);
    expect(menus.get("TNG.SOETTA2")!.get(2)!.item.price).toBe(17000);
    expect(menus.get("JKT.GANDCITY")!.get(3)!.item.price).toBe(17000);
    expect(menus.get("SMS")!.get(4)!.item.price).toBe(19000);
    expect(menus.get("MDN.KUALANAMU")!.get(4)!.item.price).toBe(19000);
    expect(menus.get("LIPPO-PURI")!.get(4)!.item.price).toBe(22000);
    expect(menus.get("TNG.T2")!.get(4)!.item.price).toBe(19000);
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

  it("KK_NEW_PRODUCTS kosong (32 menu lama dihapus pemilik) sehingga tidak ada produk baru", () => {
    const { menus } = setup();
    expect(KK_NEW_PRODUCTS).toEqual([]);
    expect(applyKkMenuPatch(menus).newProducts).toEqual([]);
    expect([...menus.values()].every((m) => [...m.keys()].every((id) => id < KK_NEW_PRODUCT_ID_BASE))).toBe(true);
  });

  it("mekanisme produk baru tetap jalan: harga tier, outletPrices didahulukan, id resmi dihormati", () => {
    const { menus } = setup();
    KK_NEW_PRODUCTS.push(
      { name: "Uji Tier", category: "Coffee", tierPrices: { normal: 10000, mall: 11000, bandara: 12000 }, outletPrices: { MSC: 9000 } },
      { id: 4242, name: "Uji Id", category: "Food", outletPrices: { "TNG.SOETTA2": 5000 } },
    );
    try {
      const { newProducts } = applyKkMenuPatch(menus);
      const price = (code: string, name: string) => [...menus.get(code)!.values()].find((e) => e.item.name === name)?.item.price;
      expect(price("MSC", "Uji Tier")).toBe(9000);
      expect(price("AEON.BSD", "Uji Tier")).toBe(11000);
      expect(price("TNG.SOETTA2", "Uji Tier")).toBe(12000);
      expect(price("MSC", "Uji Id")).toBeUndefined();
      expect(menus.get("TNG.SOETTA2")!.get(4242)!.item.price).toBe(5000);
      expect(newProducts.map((p) => p.id)).toEqual([KK_NEW_PRODUCT_ID_BASE, 4242]);
    } finally {
      KK_NEW_PRODUCTS.length = 0;
    }
  });

  it("Friend Chip Cookie (id 1261) tidak tertukar dengan Friend-chip Cookie (id 8122) dan tidak dikoreksi di bandara", () => {
    const menus = new Map<string, PatchMenu>([
      ["MSC", new Map([entry(1261, "Friend Chip Cookie", 17000), entry(8122, "Friend-chip Cookie", 25000)])],
      ["TNG.SOETTA2", new Map([entry(1261, "Friend Chip Cookie", 17000)])],
    ]);
    applyKkMenuPatch(menus);
    expect(menus.get("MSC")!.get(1261)!.item.price).toBe(19000);
    expect(menus.get("MSC")!.get(8122)!.item.price).toBe(25000);
    expect(menus.get("TNG.SOETTA2")!.get(1261)!.item.price).toBe(17000);
  });

  it("tidak menambah Seliter dan Merch", () => {
    const { menus } = setup();
    const { newProducts } = applyKkMenuPatch(menus);
    expect(newProducts.some((p) => /seliter|tumbler|kaos/i.test(p.name))).toBe(false);
  });
});
