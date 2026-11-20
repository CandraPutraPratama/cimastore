import { describe, expect, it } from "vitest";
import { priceLine } from "./selection";
import type { ResolvedProduct } from "./types";

const milkTea: ResolvedProduct = {
  id: "milk-tea",
  name: "Signature Milk Tea",
  basePrice: 25000,
  status: "available",
  optionGroups: [
    {
      id: "size",
      name: "Ukuran",
      selection: "single",
      min: 1,
      max: 1,
      options: [
        { id: "regular", name: "Regular", priceDelta: 0, isDefault: true },
        { id: "large", name: "Large", priceDelta: 5000, compareAtDelta: 8000 },
      ],
    },
    {
      id: "ice",
      name: "Es",
      selection: "single",
      min: 1,
      max: 1,
      options: [
        { id: "normal-ice", name: "Normal Ice", priceDelta: 0 },
        { id: "less-ice", name: "Less Ice", priceDelta: 0 },
      ],
    },
    {
      id: "topping",
      name: "Topping",
      selection: "multiple",
      min: 0,
      max: 2,
      options: [
        { id: "pearl-r", name: "Pearl", priceDelta: 4000, requiresAnyOf: ["regular"] },
        { id: "pearl-l", name: "Pearl", priceDelta: 5000, requiresAnyOf: ["large"] },
        { id: "pudding", name: "Pudding", priceDelta: 6000 },
        { id: "jelly", name: "Jelly", priceDelta: 6000 },
      ],
    },
  ],
};

describe("priceLine", () => {
  it("menghitung harga per porsi dan harga coret", () => {
    const result = priceLine(milkTea, {
      productId: "milk-tea",
      quantity: 2,
      optionIds: ["less-ice", "large", "pearl-l"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line.unitPrice).toBe(25000 + 5000 + 5000);
    expect(result.line.compareAtUnitPrice).toBe(25000 + 8000 + 5000);
    // Urutan opsi mengikuti katalog, bukan urutan klik.
    expect(result.line.options.map((o) => o.id)).toEqual(["large", "less-ice", "pearl-l"]);
  });

  it("menolak grup wajib yang belum dipilih", () => {
    const result = priceLine(milkTea, { productId: "milk-tea", quantity: 1, optionIds: ["regular"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ code: "GROUP_MIN", groupId: "ice" })]);
  });

  it("menolak dua pilihan di grup single dan melebihi maksimal", () => {
    const result = priceLine(milkTea, {
      productId: "milk-tea",
      quantity: 1,
      optionIds: ["regular", "large", "normal-ice", "pearl-r", "pudding", "jelly"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((e) => `${e.code}:${e.groupId ?? e.optionId}`);
    expect(codes).toContain("GROUP_MAX:size");
    expect(codes).toContain("GROUP_MAX:topping");
  });

  it("menolak opsi bersyarat yang tidak cocok dengan ukuran", () => {
    const result = priceLine(milkTea, {
      productId: "milk-tea",
      quantity: 1,
      optionIds: ["regular", "normal-ice", "pearl-l"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: "OPTION_REQUIRES", optionId: "pearl-l" });
  });

  it("menolak opsi asing, opsi ganda, jumlah tidak valid, dan produk habis", () => {
    const result = priceLine(
      { ...milkTea, status: "sold_out" },
      { productId: "milk-tea", quantity: 0, optionIds: ["regular", "regular", "normal-ice", "x"] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((e) => e.code);
    expect(codes).toEqual(
      expect.arrayContaining(["PRODUCT_UNAVAILABLE", "INVALID_QUANTITY", "DUPLICATE_OPTION", "UNKNOWN_OPTION"]),
    );
  });

  it("menyimpan catatan yang sudah dirapikan", () => {
    const result = priceLine(milkTea, {
      productId: "milk-tea",
      quantity: 1,
      optionIds: ["regular", "normal-ice"],
      note: "  gula dipisah ",
    });
    expect(result.ok && result.line.note).toBe("gula dipisah");
  });
});
