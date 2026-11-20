import { describe, expect, it } from "vitest";
import { CatalogSnapshotSchema } from "../core/catalog/snapshot";
import { defaultOptionIds, resolveProductFromSnapshot } from "../core/catalog/resolve";
import { priceLine } from "../core/catalog/selection";
import { buildStoreMenuSnapshot, cleanOptionLabel } from "./store-menu-format";

const ice = {
  group_name: "Ice Level",
  type: "single",
  is_required: true,
  options: [
    { label: "Normal Ice", price: 0, is_default: true },
    { label: "Less Ice", price: 0, is_default: false },
  ],
};

const products = [
  {
    product_code: "MT",
    name: "Milk Tea",
    categories: ["Milk Tea Series"],
    image_url: "https://cdn.brand.example/mt.jpg",
    regular_price: 25000,
    large_price: 30000,
    is_regular_available: true,
    is_large_available: true,
    addons: [
      ice,
      {
        group_name: "Topping",
        type: "multiple",
        is_required: false,
        max_choices: 2,
        options: [
          { label: "PEARL (R)", price: 5000, only_size: "regular" },
          { label: "PEARL (L)", price: 6000, only_size: "large" },
          { label: "Cheese Foam", price: 7000 },
        ],
      },
    ],
  },
  {
    product_code: "FT",
    name: "Fruit Tea",
    categories: ["Fruit Tea Series"],
    image_url: "https://db.akzara.id/storage/ft.jpg",
    regular_price: 20000,
    large_price: null,
    is_regular_available: true,
    is_large_available: false,
    addons: [
      ice,
      { group_name: "Topping", type: "multiple", options: [{ label: "Jelly (L)", price: 5000, only_size: "large" }] },
    ],
  },
  { product_code: "X", name: "Tanpa Harga", categories: ["Lainnya"], is_regular_available: true, regular_price: null },
];

const outlets = [
  { code: "A", name: "Brand - Outlet A", city: "Bandung", address: "🍰 Promo | 📍Jl. Merdeka 1,", latitude: -6.9, longitude: 107.6, is_active: true, open_status: "9:00", real_close_time: "21:30:00" },
  { code: "B", name: "Brand - Outlet B", city: "Jl. Sudirman", is_active: true },
  { code: "C", name: "Brand - Outlet C", is_active: false },
];

const outletMenus = [
  {
    outlet_code: "A",
    menu_items: [
      { product_code: "MT", regular_price: 25000, large_price: 30000, is_sold_out: false },
      { product_code: "FT", regular_price: 20000, is_sold_out: true },
    ],
  },
  { outlet_code: "B", menu_items: [{ product_code: "MT", regular_price: 27000, large_price: 34000 }] },
];

function build() {
  return buildStoreMenuSnapshot(
    { products, outlets, outletMenus },
    {
      brand: "contoh",
      source: "test",
      generatedAt: "2026-11-20T12:00:00+07:00",
      priceListPrefix: "c",
      cleanOutletName: (n) => n.replace(/^Brand - /, ""),
      cleanAddress: (a) => a.slice(a.lastIndexOf("📍") + 2).replace(/,$/, ""),
      blockedImageHosts: ["akzara.id"],
    },
  );
}

describe("buildStoreMenuSnapshot", () => {
  it("menghasilkan snapshot valid dengan laporan yang jujur", () => {
    const { snapshot, report } = build();
    const parsed = CatalogSnapshotSchema.parse(snapshot);
    expect(parsed.products.map((p) => p.id)).toEqual(["MT", "FT"]);
    expect(report.counts).toMatchObject({ outlets: 2, products: 2, priceLists: 2, soldOut: 1, hiddenAtOutlet: 1 });
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Tanpa Harga"),
        "1 foto produk tidak dipakai karena berasal dari server pihak ketiga.",
        "1 outlet nonaktif dilewati.",
      ]),
    );
    expect(parsed.products[0].imageUrl).toBe("https://cdn.brand.example/mt.jpg");
    expect(parsed.products[1].imageUrl).toBeUndefined();
  });

  it("merapikan outlet: nama, alamat, kota berisi nama jalan, jam buka", () => {
    const { snapshot } = build();
    expect(snapshot.outlets[0]).toMatchObject({
      name: "Outlet A",
      city: "Bandung",
      address: "Jl. Merdeka 1",
      hours: { open: "09:00", close: "21:30" },
    });
    expect(snapshot.outlets[1].city).toBeUndefined();
    expect(snapshot.outlets[1].hours).toBeNull();
  });

  it("ukuran jadi grup opsi; topping khusus ukuran mensyaratkan ukurannya", () => {
    const snap = CatalogSnapshotSchema.parse(build().snapshot);
    const mt = resolveProductFromSnapshot(snap, "A", "MT")!;
    expect(mt.basePrice).toBe(25000);
    const size = mt.optionGroups[0];
    expect(size.options.map((o) => [o.name, o.priceDelta, o.isDefault])).toEqual([
      ["Regular", 0, true],
      ["Large", 5000, false],
    ]);
    const topping = mt.optionGroups.find((g) => g.name === "Topping")!;
    const pearlL = topping.options.find((o) => o.name === "Pearl" && o.priceDelta === 6000)!;
    expect(pearlL.requiresAnyOf).toEqual([size.options[1].id]);

    const large = priceLine(mt, { productId: "MT", quantity: 1, optionIds: [size.options[1].id, mt.optionGroups[1].options[0].id, pearlL.id] });
    expect(large.ok && large.line.unitPrice).toBe(25000 + 5000 + 6000);
  });

  it("produk satu ukuran: tanpa grup ukuran, topping ukuran lain dibuang", () => {
    const snap = CatalogSnapshotSchema.parse(build().snapshot);
    const ft = resolveProductFromSnapshot(snap, "A", "FT")!;
    expect(ft.optionGroups.map((g) => g.name)).toEqual(["Ice Level"]);
    expect(ft.status).toBe("sold_out");
  });

  it("harga per outlet: harga dasar dan selisih Large berbeda di outlet B", () => {
    const snap = CatalogSnapshotSchema.parse(build().snapshot);
    const mt = resolveProductFromSnapshot(snap, "B", "MT")!;
    expect(mt.basePrice).toBe(27000);
    expect(mt.optionGroups[0].options[1].priceDelta).toBe(7000);
    expect(resolveProductFromSnapshot(snap, "B", "FT")).toBeNull();
    expect(snap.availability).toContainEqual({ outletCode: "B", productId: "FT", status: "hidden" });
  });

  it("grup opsi yang isinya identik dipakai bersama", () => {
    const snap = CatalogSnapshotSchema.parse(build().snapshot);
    const iceGroups = snap.optionGroups.filter((g) => g.name === "Ice Level");
    expect(iceGroups).toHaveLength(1);
    const mt = resolveProductFromSnapshot(snap, "A", "MT")!;
    const choice = priceLine(mt, { productId: "MT", quantity: 1, optionIds: defaultOptionIds(mt) });
    expect(choice.ok).toBe(true);
  });
});

describe("cleanOptionLabel", () => {
  it("membuang penanda ukuran dan merapikan huruf kapital", () => {
    expect(cleanOptionLabel("PEARL (L)", true)).toBe("Pearl");
    expect(cleanOptionLabel("ESPRESSO SHOT R", true)).toBe("Espresso Shot");
    expect(cleanOptionLabel("CT RAINBOW JELLY (S)", true)).toBe("CT Rainbow Jelly");
    expect(cleanOptionLabel("Oat Milk", false)).toBe("Oat Milk");
    expect(cleanOptionLabel("NH HONEY (R)", false)).toBe("Nh Honey (R)");
  });
});
