import { describe, expect, it } from "vitest";
import { priceLine } from "./selection";
import { defaultOptionIds } from "./resolve";
import { MenuPayloadSchema, menuPricingConfig, resolveMenuProduct, startingPrice } from "./storefront";
import { priceOrder } from "../pricing/engine";

// Bentuk persis keluaran catalog_menu (field null sudah dibuang oleh database).
const raw = {
  brand: {
    slug: "kopi-kenangan",
    name: "Kopi Kenangan",
    theme: { accent: "#C8102E" },
    outletMode: "catalog",
    isActive: true,
    splitMode: "auto",
    feeRules: { type: "per_item", amount: 2300, singleItemAmount: 4000 },
    maxItemsPerOrder: 20,
  },
  promos: [
    { id: "p1", name: "Diskon 50% (maks Rp35.000)", level: "transaction", type: "percent", value: 50, scope: "all_items", appliesTo: "base_price", maxDiscount: 35000, active: true },
  ],
  outlet: { code: "LIPPO-PURI", name: "Lippo Mall Puri", openTime: "10:00", closeTime: "21:45" },
  categories: [{ id: "Coffee", name: "Coffee" }],
  optionGroups: {
    size: {
      id: "size",
      name: "Ukuran",
      selection: "single",
      min: 1,
      max: 1,
      options: [
        { id: "size.regular", name: "Regular", priceDelta: 0, isDefault: true },
        { id: "size.large", name: "Large", priceDelta: 5000, compareAtDelta: 6000, isDefault: false },
      ],
    },
    topping: { id: "topping", name: "Topping", selection: "multiple", min: 0, options: [{ id: "topping.boba", name: "Golden Boba", priceDelta: 6000, isDefault: false }] },
  },
  products: [
    { id: "9645", categoryId: "Coffee", name: "Kopi Kenangan Mantan", basePrice: 22000, status: "available", optionGroupIds: ["size", "topping"], optionDeltas: { "size.large": 7000 } },
  ],
};

describe("storefront", () => {
  it("membaca payload menu dari database", () => {
    const menu = MenuPayloadSchema.parse(raw);
    expect(menu.optionGroups.topping.max).toBeNull();
    expect(menu.promos[0]).toMatchObject({ maxDiscount: 35000, minSubtotal: null, productIds: null });
  });

  it("menyusun produk dengan override harga opsi per outlet", () => {
    const menu = MenuPayloadSchema.parse(raw);
    const product = resolveMenuProduct(menu, "9645")!;
    expect(product.optionGroups[0].options[1]).toMatchObject({ name: "Large", priceDelta: 7000, compareAtDelta: 6000 });
    expect(resolveMenuProduct(menu, "x")).toBeNull();
    expect(startingPrice(menu, menu.products[0])).toBe(22000);
  });

  it("ujung ke ujung: pilihan default -> harga pesanan", () => {
    const menu = MenuPayloadSchema.parse(raw);
    const product = resolveMenuProduct(menu, "9645")!;
    const line = priceLine(product, { productId: "9645", quantity: 2, optionIds: defaultOptionIds(product) });
    expect(line.ok).toBe(true);
    if (!line.ok) return;
    const order = priceOrder([line.line], menuPricingConfig(menu));
    expect(order).toMatchObject({ subtotal: 44000, discount: 22000, fee: 4600, total: 26600 });
  });
});
