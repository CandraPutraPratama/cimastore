import { describe, expect, it } from "vitest";
import { dedupePriceLists } from "./dedupe";
import { CatalogSnapshotSchema, type CatalogSnapshotInput } from "./snapshot";

const validSnapshot = (): CatalogSnapshotInput => ({
  brand: "chagee",
  generatedAt: "2026-11-20T05:18:28.164+00:00",
  source: "test",
  outlets: [{ code: "CHID039", name: "23 Paskal Bandung", priceListCode: "PL-1", hours: { open: "10:00", close: "22:00" } }],
  categories: [{ id: "seasonal", name: "Seasonal Drinks" }],
  optionGroups: [
    {
      id: "size",
      name: "Ukuran",
      selection: "single",
      min: 1,
      max: 1,
      options: [
        { id: "regular", name: "Regular", priceDelta: 0, isDefault: true },
        { id: "large", name: "Large", priceDelta: 7000 },
      ],
    },
  ],
  products: [{ id: "mango", categoryId: "seasonal", name: "Mango Jasmine", optionGroupIds: ["size"] }],
  priceLists: [{ code: "PL-1", basePrices: { mango: 45000 }, optionDeltas: { mango: { large: 7000 } } }],
});

describe("CatalogSnapshotSchema", () => {
  it("menerima snapshot yang konsisten dan mengisi nilai default", () => {
    const parsed = CatalogSnapshotSchema.parse(validSnapshot());
    expect(parsed.availability).toEqual([]);
    expect(parsed.priceLists[0].compareAtBasePrices).toEqual({});
  });

  it("menolak referensi yang tidak ada", () => {
    const snap = validSnapshot();
    snap.products[0].categoryId = "x";
    snap.outlets[0].priceListCode = "PL-9";
    snap.priceLists[0].optionDeltas = { mango: { jumbo: 1 } };
    const result = CatalogSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join("\n");
    expect(messages).toContain("kategori tidak ada (x)");
    expect(messages).toContain("price list tidak ada (PL-9)");
    expect(messages).toContain("opsi tidak ada (jumbo)");
  });

  it("menolak harga desimal, negatif, dan jam yang salah format", () => {
    const snap = validSnapshot();
    snap.priceLists[0].basePrices = { mango: 45000.5 };
    snap.outlets[0].hours = { open: "9:00", close: "22:00" };
    expect(CatalogSnapshotSchema.safeParse(snap).success).toBe(false);
  });
});

describe("dedupePriceLists", () => {
  it("menggabungkan price list identik meski urutan key berbeda", () => {
    const { priceLists, priceListByOutlet } = dedupePriceLists(
      [
        { outletCode: "A", content: { basePrices: { x: 1, y: 2 }, compareAtBasePrices: {}, optionDeltas: {} } },
        { outletCode: "B", content: { basePrices: { y: 2, x: 1 }, compareAtBasePrices: {}, optionDeltas: {} } },
        { outletCode: "C", content: { basePrices: { x: 1, y: 3 }, compareAtBasePrices: {}, optionDeltas: {} } },
      ],
      "kk",
    );
    expect(priceLists).toHaveLength(2);
    const [first, second] = priceLists.map((p) => p.code);
    expect(first).toMatch(/^kk-[0-9a-z]+$/);
    expect(first).not.toBe(second);
    expect(Object.fromEntries(priceListByOutlet)).toEqual({ A: first, B: first, C: second });
  });

  it("kode price list ditentukan isinya, bukan urutan", () => {
    const a = { basePrices: { x: 1 }, compareAtBasePrices: {}, optionDeltas: {} };
    const b = { basePrices: { x: 2 }, compareAtBasePrices: {}, optionDeltas: {} };
    const run1 = dedupePriceLists([{ outletCode: "A", content: a }, { outletCode: "B", content: b }], "kk");
    const run2 = dedupePriceLists([{ outletCode: "B", content: b }, { outletCode: "A", content: a }], "kk");
    expect(run1.priceListByOutlet.get("A")).toBe(run2.priceListByOutlet.get("A"));
    expect(run1.priceListByOutlet.get("B")).toBe(run2.priceListByOutlet.get("B"));
  });
});
