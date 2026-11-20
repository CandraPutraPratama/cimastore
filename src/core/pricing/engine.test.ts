import { describe, expect, it } from "vitest";
import type { PricedLine } from "../catalog/selection";
import { computeFee, priceOrder } from "./engine";
import { PromoSchema, type BrandPricingConfig, type PromoInput } from "./rules";

const promo = (input: PromoInput) => PromoSchema.parse(input);

function line(
  productId: string,
  basePrice: number,
  quantity = 1,
  extra: { options?: number; compareAt?: number } = {},
): PricedLine {
  const optionsPrice = extra.options ?? 0;
  return {
    productId,
    name: productId,
    quantity,
    basePrice,
    optionsPrice,
    unitPrice: basePrice + optionsPrice,
    compareAtUnitPrice: extra.compareAt ?? basePrice + optionsPrice,
    options: [],
  };
}

// Konfigurasi sesuai keputusan pemilik (20 Nov 2026). Nominal fee hanya contoh untuk test.
const KK: BrandPricingConfig = {
  splitMode: "auto",
  fee: { type: "per_item", amount: 2300, singleItemAmount: 4000 },
  promos: [
    promo({ id: "kk-50", name: "Diskon 50%", level: "transaction", type: "percent", value: 50, appliesTo: "base_price", maxDiscount: 35000 }),
    promo({ id: "kk-30k", name: "Potongan 30rb", level: "transaction", type: "fixed", value: 30000, appliesTo: "base_price", minSubtotal: 50000 }),
  ],
};

const FORE: BrandPricingConfig = {
  splitMode: "auto",
  fee: { type: "none" },
  promos: [promo({ id: "fore-25", name: "Diskon 25%", level: "transaction", type: "percent", value: 25, maxDiscount: 50000 })],
};

const CHAGEE: BrandPricingConfig = {
  splitMode: "auto",
  fee: { type: "per_item", amount: 0, singleItemAmount: null },
  promos: [
    promo({ id: "cg-30", name: "Diskon 30%", level: "transaction", type: "percent", value: 30, maxQty: 1, maxUsesPerOrder: 1 }),
    promo({ id: "cg-50", name: "Diskon 50% (2 item)", level: "transaction", type: "percent", value: 50, scope: "cheapest_item", minQty: 2, maxQty: 2 }),
  ],
};

const CHATIME: BrandPricingConfig = {
  splitMode: "auto",
  fee: { type: "per_item", amount: 1000, singleItemAmount: null },
  promos: [promo({ id: "ct-10k", name: "Potongan 10rb", level: "transaction", type: "fixed", value: 10000, maxQty: 1 })],
};

const MIXUE: BrandPricingConfig = {
  splitMode: "auto",
  fee: { type: "per_order", amount: 2000 },
  promos: [
    promo({ id: "mx-sundae", name: "Boba Sundae 50%", level: "item", type: "percent", value: 50, maxUnits: 1, productIds: ["boba-sundae"] }),
    promo({ id: "mx-10k", name: "Potongan 10rb", level: "transaction", type: "fixed", value: 10000, minSubtotal: 40000 }),
  ],
};

describe("Kopi Kenangan", () => {
  it("1 minuman: diskon 50% harga dasar, fee 1 item Rp4.000", () => {
    const order = priceOrder([line("mantan", 25000)], KK);
    expect(order.discount).toBe(12500);
    expect(order.fee).toBe(4000);
    expect(order.total).toBe(16500);
  });

  it("tambahan Large tidak ikut didiskon, harga coret pakai harga Large asli", () => {
    const order = priceOrder([line("mantan", 25000, 1, { options: 5000, compareAt: 35000 })], KK);
    expect(order.discount).toBe(12500);
    expect(order.subtotal - order.discount).toBe(17500);
    expect(order.savings).toBe(35000 - 17500);
  });

  it("belanja Rp70.000 dapat potongan penuh Rp35.000 dalam 1 transaksi", () => {
    const order = priceOrder([line("aren", 35000, 2)], KK);
    expect(order.discount).toBe(35000);
    expect(order.transactions).toHaveLength(1);
  });

  it("3 x Rp25.000 dipecah: potongan 30rb untuk 2 item + 50% untuk 1 item", () => {
    const order = priceOrder([line("mantan", 25000, 3)], KK);
    expect(order.splitMethod).toBe("exact");
    expect(order.discount).toBe(30000 + 12500);
    expect(order.transactions.map((t) => [t.promo?.id, t.units[0].quantity])).toEqual([
      ["kk-30k", 2],
      ["kk-50", 1],
    ]);
    expect(order.fee).toBe(3 * 2300);
  });

  it("split_mode none: semua item dalam 1 transaksi", () => {
    const order = priceOrder([line("mantan", 25000, 3)], { ...KK, splitMode: "none" });
    expect(order.discount).toBe(35000);
    expect(order.transactions).toHaveLength(1);
    expect(order.splitMethod).toBe("single");
  });

  it("memberi petunjuk kekurangan belanja untuk voucher Rp30.000", () => {
    const order = priceOrder([line("mantan", 25000)], KK);
    expect(order.hint).toEqual({ promoId: "kk-30k", promoName: "Potongan 30rb", amountNeeded: 25000, discount: 30000 });
  });
});

describe("Chagee (contoh nyata pemilik)", () => {
  it("1 item: voucher 30%", () => {
    expect(priceOrder([line("mango", 45000)], CHAGEE).total).toBe(31500);
  });

  it("2 item @Rp45.000: voucher 50% memotong 1 item, total Rp67.500", () => {
    const order = priceOrder([line("mango", 45000, 2)], CHAGEE);
    expect(order.discount).toBe(22500);
    expect(order.total).toBe(67500);
    expect(order.transactions).toHaveLength(1);
    expect(order.transactions[0].promo?.id).toBe("cg-50");
  });

  it("3 item: voucher 50% (2 item) + 30% (1 item)", () => {
    const order = priceOrder([line("mango", 45000, 3)], CHAGEE);
    expect(order.discount).toBe(22500 + 13500);
    expect(order.transactions.map((t) => t.promo?.id).sort()).toEqual(["cg-30", "cg-50"]);
  });

  it("4 item: voucher 50% dua kali (voucher 30% maks 1x)", () => {
    const order = priceOrder([line("mango", 45000, 4)], CHAGEE);
    expect(order.discount).toBe(45000);
    expect(order.transactions.every((t) => t.promo?.id === "cg-50")).toBe(true);
  });

  it("harga berbeda: 50% jatuh ke item termurah", () => {
    const order = priceOrder([line("mango", 45000), line("oolong", 30000)], CHAGEE);
    expect(order.discount).toBe(15000);
  });
});

describe("Chatime", () => {
  it("1 voucher Rp10.000 per item, hemat tidak berkurang", () => {
    const order = priceOrder([line("a", 25000), line("b", 30000), line("c", 20000)], CHATIME);
    expect(order.discount).toBe(30000);
    expect(order.transactions).toHaveLength(3);
    expect(order.fee).toBe(3000);
  });
});

describe("Fore", () => {
  it("diskon 25% tanpa fee", () => {
    const order = priceOrder([line("aren", 31000), line("pandan", 36000)], FORE);
    expect(order.discount).toBe(16750);
    expect(order.fee).toBe(0);
  });

  it("pesanan besar dipecah supaya tidak mentok batas Rp50.000", () => {
    const order = priceOrder([line("aren", 31000, 8)], FORE);
    expect(order.discount).toBe(Math.floor(248000 / 4));
    expect(order.transactions.length).toBeGreaterThan(1);
  });
});

describe("Mixue", () => {
  it("Boba Sundae 50% maks 1 porsi, digabung potongan Rp10.000, fee per pesanan", () => {
    const order = priceOrder([line("boba-sundae", 16000, 2), line("lemonade", 22000)], MIXUE);
    expect(order.itemDiscount).toBe(8000);
    expect(order.itemPromos).toEqual([
      { promoId: "mx-sundae", promoName: "Boba Sundae 50%", lineIndex: 0, quantity: 1, discount: 8000 },
    ]);
    expect(order.transactionDiscount).toBe(10000);
    expect(order.fee).toBe(2000);
    expect(order.total).toBe(54000 - 18000 + 2000);
  });

  it("minimal belanja dihitung setelah potongan Boba Sundae", () => {
    // 16.000 + 30.000 = 46.000, setelah sundae 50% jadi 38.000 (< 40.000).
    const order = priceOrder([line("boba-sundae", 16000), line("lemonade", 30000)], MIXUE);
    expect(order.transactionDiscount).toBe(0);
  });
});

describe("umum", () => {
  it("keranjang kosong", () => {
    const order = priceOrder([], KK);
    expect(order).toMatchObject({ itemCount: 0, total: 0, fee: 0, transactions: [], hint: null });
  });

  it("promo nonaktif dan di luar periode diabaikan", () => {
    const config: BrandPricingConfig = {
      ...FORE,
      promos: [
        promo({ id: "off", name: "off", level: "transaction", type: "percent", value: 90, active: false }),
        promo({ id: "late", name: "late", level: "transaction", type: "percent", value: 90, startsAt: "2026-12-01T00:00:00+07:00" }),
        promo({ id: "ended", name: "ended", level: "transaction", type: "percent", value: 90, endsAt: "2026-11-01T00:00:00+07:00" }),
      ],
    };
    const order = priceOrder([line("x", 10000)], config, { now: new Date("2026-11-20T12:00:00+07:00") });
    expect(order.discount).toBe(0);
  });

  it("beralih ke cara cepat bila keranjang terlalu besar, hasil tetap masuk akal", () => {
    const lines = Array.from({ length: 12 }, (_, i) => line(`p${i}`, 20000 + i * 1000));
    const exact = priceOrder(lines.slice(0, 4), KK);
    const greedy = priceOrder(lines.slice(0, 4), KK, { exactSearchBudget: 1 });
    expect(greedy.splitMethod).toBe("greedy");
    expect(greedy.discount).toBeGreaterThan(0);
    expect(greedy.discount).toBeLessThanOrEqual(exact.discount);

    const started = performance.now();
    const big = priceOrder(lines, KK);
    expect(performance.now() - started).toBeLessThan(500);
    expect(big.discount).toBeGreaterThanOrEqual(priceOrder(lines, { ...KK, splitMode: "none" }).discount);
  });

  it("total selalu = subtotal - potongan + fee, dan tiap porsi masuk tepat satu transaksi", () => {
    const lines = [line("a", 25000, 3, { options: 5000 }), line("b", 18000, 2), line("c", 32000)];
    for (const config of [KK, FORE, CHAGEE, CHATIME, MIXUE]) {
      const order = priceOrder(lines, config);
      expect(order.total).toBe(order.subtotal - order.discount + order.fee);
      const perLine = new Map<number, number>();
      for (const tx of order.transactions) {
        expect(tx.total).toBe(tx.subtotal - tx.discount);
        for (const u of tx.units) perLine.set(u.lineIndex, (perLine.get(u.lineIndex) ?? 0) + u.quantity);
      }
      expect([...perLine.entries()].sort()).toEqual([
        [0, 3],
        [1, 2],
        [2, 1],
      ]);
      expect(order.transactions.reduce((s, t) => s + t.discount, 0)).toBe(order.transactionDiscount);
    }
  });
});

describe("computeFee", () => {
  it("menghitung semua jenis fee", () => {
    expect(computeFee({ type: "none" }, 3)).toBe(0);
    expect(computeFee({ type: "per_order", amount: 2500 }, 4)).toBe(2500);
    expect(computeFee({ type: "per_item", amount: 2000, singleItemAmount: 4000 }, 1)).toBe(4000);
    expect(computeFee({ type: "per_item", amount: 2000, singleItemAmount: 4000 }, 3)).toBe(6000);
    expect(computeFee({ type: "per_item", amount: 2000, singleItemAmount: null }, 1)).toBe(2000);
    expect(computeFee({ type: "per_order", amount: 2500 }, 0)).toBe(0);
  });
});

describe("PromoSchema", () => {
  it("menolak aturan promo yang tidak masuk akal", () => {
    const base = { id: "x", name: "x", level: "transaction", type: "percent", value: 50 } as const;
    expect(PromoSchema.safeParse({ ...base, value: 150 }).success).toBe(false);
    expect(PromoSchema.safeParse({ ...base, minQty: 3, maxQty: 2 }).success).toBe(false);
    expect(PromoSchema.safeParse({ ...base, level: "item" }).success).toBe(false);
    expect(PromoSchema.safeParse({ ...base, value: 12.5 }).success).toBe(false);
  });
});
