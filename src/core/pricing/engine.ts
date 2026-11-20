import type { PricedLine } from "../catalog/selection";
import { activePromos, type BrandPricingConfig, type FeeRules, type Promo } from "./rules";

/**
 * Mesin harga Jasdor.
 *
 * Konsep: pemilik membeli pesanan customer lewat app brand, dan voucher berlaku per
 * transaksi. Satu pesanan boleh dibeli dalam beberapa transaksi supaya potongan
 * maksimal. Mesin ini:
 *   1. memasang promo level item (misal Boba Sundae 50%) ke porsi yang cocok,
 *   2. memecah keranjang menjadi transaksi dengan total potongan terbesar
 *      (pencarian menyeluruh untuk keranjang kecil, cara cepat untuk keranjang besar),
 *   3. menambahkan fee jasa.
 *
 * Semua potongan dibulatkan ke bawah ke rupiah penuh.
 */

export interface PricedTransaction {
  /** Porsi yang dibeli di transaksi ini, dikelompokkan per baris keranjang. */
  units: Array<{ lineIndex: number; quantity: number }>;
  promo: { id: string; name: string } | null;
  /** Jumlah harga porsi setelah potongan promo item. */
  subtotal: number;
  discount: number;
  total: number;
}

export interface AppliedItemPromo {
  promoId: string;
  promoName: string;
  lineIndex: number;
  quantity: number;
  discount: number;
}

export interface PromoHint {
  promoId: string;
  promoName: string;
  /** Kekurangan belanja agar voucher bisa dipakai. */
  amountNeeded: number;
  discount: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  itemCount: number;
  /** Jumlah harga semua porsi sebelum potongan. */
  subtotal: number;
  itemDiscount: number;
  transactionDiscount: number;
  discount: number;
  fee: number;
  /** Yang dibayar customer: subtotal - discount + fee. */
  total: number;
  /** Jumlah harga asli brand (harga coret). */
  compareAtTotal: number;
  /** "Kamu hemat": dari harga asli, tanpa memperhitungkan fee. */
  savings: number;
  transactions: PricedTransaction[];
  itemPromos: AppliedItemPromo[];
  splitMethod: "single" | "exact" | "greedy";
  hint: PromoHint | null;
}

export interface PriceOrderOptions {
  now?: Date;
  /** Batas evaluasi untuk pencarian menyeluruh sebelum beralih ke cara cepat. */
  exactSearchBudget?: number;
}

const DEFAULT_EXACT_SEARCH_BUDGET = 4_000;

/** Kelompok porsi identik (baris sama, promo item sama). */
interface UnitType {
  lineIndex: number;
  productId: string;
  basePrice: number;
  unitPrice: number;
  itemDiscount: number;
  count: number;
}

class BudgetExceeded extends Error {}

function percentOf(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}

function computeDiscount(promo: Promo, discountable: number): number {
  if (discountable <= 0) return 0;
  const raw = promo.type === "percent" ? percentOf(discountable, promo.value) : Math.min(promo.value, discountable);
  return promo.maxDiscount === null ? raw : Math.min(raw, promo.maxDiscount);
}

function discountBase(promo: Promo, t: Pick<UnitType, "basePrice" | "unitPrice" | "itemDiscount">): number {
  const gross = promo.appliesTo === "base_price" ? t.basePrice : t.unitPrice;
  return Math.max(0, gross - t.itemDiscount);
}

function isEligibleProduct(promo: Promo, productId: string): boolean {
  return promo.productIds === null || promo.productIds.includes(productId);
}

/** Potongan voucher transaksi untuk sekumpulan porsi, atau 0 bila syarat tidak terpenuhi. */
function evaluateTransaction(promo: Promo, types: UnitType[], counts: number[]): number {
  let qty = 0;
  let net = 0;
  let sumBase = 0;
  let cheapest = Infinity;
  for (let i = 0; i < types.length; i++) {
    const c = counts[i];
    if (c === 0) continue;
    const t = types[i];
    qty += c;
    net += c * (t.unitPrice - t.itemDiscount);
    if (isEligibleProduct(promo, t.productId)) {
      const base = discountBase(promo, t);
      sumBase += c * base;
      if (base < cheapest) cheapest = base;
    }
  }
  if (qty === 0 || cheapest === Infinity) return 0;
  if (promo.minQty !== null && qty < promo.minQty) return 0;
  if (promo.maxQty !== null && qty > promo.maxQty) return 0;
  if (promo.minSubtotal !== null && net < promo.minSubtotal) return 0;
  return computeDiscount(promo, promo.scope === "cheapest_item" ? cheapest : sumBase);
}

/** Memasang promo level item ke porsi dengan potongan terbesar lebih dulu. */
function applyItemPromos(
  lines: PricedLine[],
  itemPromos: Promo[],
): { types: UnitType[]; applied: AppliedItemPromo[] } {
  type Unit = { lineIndex: number; promo: Promo | null; discount: number };
  const units: Unit[] = [];
  lines.forEach((line, lineIndex) => {
    for (let q = 0; q < line.quantity; q++) units.push({ lineIndex, promo: null, discount: 0 });
  });

  const candidates: Array<{ unit: Unit; promo: Promo; discount: number }> = [];
  for (const unit of units) {
    const line = lines[unit.lineIndex];
    for (const promo of itemPromos) {
      if (!isEligibleProduct(promo, line.productId)) continue;
      const d = computeDiscount(promo, discountBase(promo, { ...line, itemDiscount: 0 }));
      if (d > 0) candidates.push({ unit, promo, discount: d });
    }
  }
  candidates.sort((a, b) => b.discount - a.discount);

  const used = new Map<string, number>();
  for (const c of candidates) {
    if (c.unit.promo) continue;
    const n = used.get(c.promo.id) ?? 0;
    if (c.promo.maxUnits !== null && n >= c.promo.maxUnits) continue;
    c.unit.promo = c.promo;
    c.unit.discount = c.discount;
    used.set(c.promo.id, n + 1);
  }

  const typeByKey = new Map<string, UnitType>();
  const appliedByKey = new Map<string, AppliedItemPromo>();
  for (const unit of units) {
    const line = lines[unit.lineIndex];
    const key = `${unit.lineIndex}|${unit.promo?.id ?? ""}|${unit.discount}`;
    const existing = typeByKey.get(key);
    if (existing) existing.count++;
    else
      typeByKey.set(key, {
        lineIndex: unit.lineIndex,
        productId: line.productId,
        basePrice: line.basePrice,
        unitPrice: line.unitPrice,
        itemDiscount: unit.discount,
        count: 1,
      });
    if (unit.promo) {
      const a = appliedByKey.get(key);
      if (a) {
        a.quantity++;
        a.discount += unit.discount;
      } else
        appliedByKey.set(key, {
          promoId: unit.promo.id,
          promoName: unit.promo.name,
          lineIndex: unit.lineIndex,
          quantity: 1,
          discount: unit.discount,
        });
    }
  }
  return { types: [...typeByKey.values()], applied: [...appliedByKey.values()] };
}

interface PlanTx {
  counts: number[];
  promoIndex: number;
  discount: number;
}

interface Plan {
  discount: number;
  txs: PlanTx[];
}

function betterPlan(a: Plan, b: Plan): boolean {
  if (a.discount !== b.discount) return a.discount > b.discount;
  return a.txs.length < b.txs.length;
}

/** Potongan maksimal yang mungkin dari satu voucher (Infinity bila tak terbatas). */
function promoCeiling(promo: Promo): number {
  const fixedCap = promo.type === "fixed" ? promo.value : Infinity;
  return Math.min(fixedCap, promo.maxDiscount ?? Infinity);
}

/**
 * Pencarian menyeluruh dengan memo. Melempar BudgetExceeded bila terlalu besar.
 *
 * Transaksi dibangun dengan menambah porsi satu per satu. Dua pemangkasan yang aman:
 * - Transaksi yang potongannya tidak naik dibanding sebelum porsi terakhir ditambahkan
 *   tidak dievaluasi: porsi itu lebih baik dibeli di transaksi lain atau tanpa voucher.
 * - Transaksi tidak diperbesar lagi bila semua voucher sudah mentok (batas potongan
 *   atau batas jumlah item tercapai).
 */
function searchExact(types: UnitType[], promos: Promo[], budget: number): Plan {
  const memo = new Map<string, Plan>();
  let evaluations = 0;
  const ceilings = promos.map(promoCeiling);

  const solve = (rem: number[], usage: number[]): Plan => {
    const first = rem.findIndex((c) => c > 0);
    if (first === -1) return { discount: 0, txs: [] };
    const key = `${rem.join(",")}|${usage.join(",")}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const usable = promos.map((p, i) => p.maxUsesPerOrder === null || usage[i] < p.maxUsesPerOrder);

    // Pilihan 1: satu porsi dari tipe pertama dibeli tanpa voucher.
    const restRem = rem.slice();
    restRem[first]--;
    let best = solve(restRem, usage);

    // Pilihan 2: tipe pertama masuk transaksi bervoucher bersama sebagian porsi lain.
    const subset = new Array<number>(rem.length).fill(0);
    const consider = (parentDiscounts: number[]): number[] => {
      const discounts = new Array<number>(promos.length).fill(0);
      for (let p = 0; p < promos.length; p++) {
        if (!usable[p]) continue;
        if (++evaluations > budget) throw new BudgetExceeded();
        const d = evaluateTransaction(promos[p], types, subset);
        discounts[p] = d;
        if (d <= parentDiscounts[p]) continue;
        const nextRem = rem.map((c, k) => c - subset[k]);
        const nextUsage = usage.slice();
        nextUsage[p]++;
        const rest = solve(nextRem, nextUsage);
        const candidate: Plan = {
          discount: d + rest.discount,
          txs: [{ counts: subset.slice(), promoIndex: p, discount: d }, ...rest.txs],
        };
        if (betterPlan(candidate, best)) best = candidate;
      }
      return discounts;
    };
    const saturated = (size: number, discounts: number[]) =>
      promos.every(
        (p, i) => !usable[i] || (p.maxQty !== null && size >= p.maxQty) || discounts[i] >= ceilings[i],
      );

    // Enumerasi kombinasi (multiset) yang selalu memuat tipe `first`, porsi ditambah berurutan.
    const extend = (from: number, size: number, discounts: number[]) => {
      if (saturated(size, discounts)) return;
      for (let i = from; i < rem.length; i++) {
        if (subset[i] >= rem[i]) continue;
        subset[i]++;
        const next = consider(discounts);
        extend(i, size + 1, next);
        subset[i]--;
      }
    };
    subset[first] = 1;
    const startDiscounts = consider(new Array<number>(promos.length).fill(0));
    extend(first, 1, startDiscounts);
    subset[first] = 0;

    memo.set(key, best);
    return best;
  };

  return solve(
    types.map((t) => t.count),
    promos.map(() => 0),
  );
}

/**
 * Cara cepat untuk keranjang besar: berulang kali ambil transaksi bervoucher yang paling
 * efisien (potongan dibagi belanja), dengan dua cara menyusun kandidat transaksi.
 */
function searchGreedy(types: UnitType[], promos: Promo[]): Plan {
  const netOf = (i: number) => types[i].unitPrice - types[i].itemDiscount;
  let remaining: number[] = [];
  types.forEach((t, i) => {
    for (let c = 0; c < t.count; c++) remaining.push(i);
  });
  remaining.sort((a, b) => netOf(b) - netOf(a));

  const usage = promos.map(() => 0);
  const txs: PlanTx[] = [];
  const countsOf = (units: number[]) => {
    const counts = new Array<number>(types.length).fill(0);
    for (const u of units) counts[u]++;
    return counts;
  };
  const evalUnits = (p: number, units: number[]) => evaluateTransaction(promos[p], types, countsOf(units));

  const candidatesFor = (p: number): number[][] => {
    const maxQty = promos[p].maxQty ?? remaining.length;
    const out: number[][] = [];
    // (1) Awalan dari porsi termahal.
    for (let n = 1; n <= Math.min(maxQty, remaining.length); n++) out.push(remaining.slice(0, n));
    // (2) Porsi termahal lalu porsi termurah yang cukup untuk memenuhi syarat voucher.
    const pool = remaining.slice(1);
    const tx = [remaining[0]];
    while (tx.length < maxQty && pool.length > 0 && evalUnits(p, tx) === 0) {
      let pick = -1;
      for (let k = pool.length - 1; k >= 0; k--) {
        if (evalUnits(p, [...tx, pool[k]]) > 0) {
          pick = k;
          break;
        }
      }
      tx.push(pool.splice(pick === -1 ? 0 : pick, 1)[0]);
    }
    out.push(tx);
    return out;
  };

  for (;;) {
    let best: { units: number[]; promoIndex: number; discount: number; ratio: number } | null = null;
    for (let p = 0; p < promos.length; p++) {
      const limit = promos[p].maxUsesPerOrder;
      if (remaining.length === 0 || (limit !== null && usage[p] >= limit)) continue;
      for (const units of candidatesFor(p)) {
        const d = evalUnits(p, units);
        if (d <= 0) continue;
        const ratio = d / units.reduce((s, u) => s + netOf(u), 0);
        if (
          !best ||
          ratio > best.ratio ||
          (ratio === best.ratio && (d > best.discount || (d === best.discount && units.length < best.units.length)))
        ) {
          best = { units, promoIndex: p, discount: d, ratio };
        }
      }
    }
    if (!best) break;

    const counts = countsOf(best.units);
    txs.push({ counts, promoIndex: best.promoIndex, discount: best.discount });
    usage[best.promoIndex]++;
    const toRemove = counts.slice();
    remaining = remaining.filter((u) => {
      if (toRemove[u] > 0) {
        toRemove[u]--;
        return false;
      }
      return true;
    });
  }

  return { discount: txs.reduce((s, t) => s + t.discount, 0), txs };
}

function searchSingle(types: UnitType[], promos: Promo[]): Plan {
  const counts = types.map((t) => t.count);
  let best: Plan = { discount: 0, txs: [] };
  promos.forEach((promo, p) => {
    const d = evaluateTransaction(promo, types, counts);
    if (d > best.discount) best = { discount: d, txs: [{ counts, promoIndex: p, discount: d }] };
  });
  return best;
}

export function computeFee(fee: FeeRules, itemCount: number): number {
  if (itemCount <= 0) return 0;
  switch (fee.type) {
    case "none":
      return 0;
    case "per_order":
      return fee.amount;
    case "per_item":
      return itemCount === 1 && fee.singleItemAmount !== null ? fee.singleItemAmount : fee.amount * itemCount;
  }
}

function toTransactions(plan: Plan, types: UnitType[], promos: Promo[]): PricedTransaction[] {
  const used = types.map(() => 0);
  const build = (counts: number[], promo: Promo | null, discount: number): PricedTransaction => {
    const byLine = new Map<number, number>();
    let subtotal = 0;
    counts.forEach((c, i) => {
      if (c === 0) return;
      const t = types[i];
      byLine.set(t.lineIndex, (byLine.get(t.lineIndex) ?? 0) + c);
      subtotal += c * (t.unitPrice - t.itemDiscount);
    });
    return {
      units: [...byLine.entries()]
        .sort(([a], [b]) => a - b)
        .map(([lineIndex, quantity]) => ({ lineIndex, quantity })),
      promo: promo ? { id: promo.id, name: promo.name } : null,
      subtotal,
      discount,
      total: subtotal - discount,
    };
  };

  const result = [...plan.txs]
    .sort((a, b) => b.discount - a.discount)
    .map((tx) => {
      tx.counts.forEach((c, i) => (used[i] += c));
      return build(tx.counts, promos[tx.promoIndex], tx.discount);
    });

  const leftover = types.map((t, i) => t.count - used[i]);
  if (leftover.some((c) => c > 0)) result.push(build(leftover, null, 0));
  return result;
}

function findHint(promos: Promo[], netSubtotal: number, transactionDiscount: number): PromoHint | null {
  let hint: PromoHint | null = null;
  for (const p of promos) {
    if (p.type !== "fixed" || p.minSubtotal === null || netSubtotal >= p.minSubtotal) continue;
    const discount = p.maxDiscount === null ? p.value : Math.min(p.value, p.maxDiscount);
    if (discount <= transactionDiscount) continue;
    const amountNeeded = p.minSubtotal - netSubtotal;
    if (!hint || amountNeeded < hint.amountNeeded) {
      hint = { promoId: p.id, promoName: p.name, amountNeeded, discount };
    }
  }
  return hint;
}

/**
 * Menghitung harga satu pesanan. Fungsi murni: hasilnya hanya bergantung pada input,
 * sehingga browser dan server selalu mendapat angka yang sama.
 */
export function priceOrder(
  lines: PricedLine[],
  config: BrandPricingConfig,
  options: PriceOrderOptions = {},
): PricedOrder {
  const promos = activePromos(config.promos, options.now ?? new Date());
  const itemPromos = promos.filter((p) => p.level === "item");
  const txPromos = promos.filter((p) => p.level === "transaction");

  const { types, applied } = applyItemPromos(lines, itemPromos);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const compareAtTotal = lines.reduce((s, l) => s + l.compareAtUnitPrice * l.quantity, 0);
  const itemDiscount = applied.reduce((s, a) => s + a.discount, 0);

  let plan: Plan;
  let splitMethod: PricedOrder["splitMethod"];
  if (config.splitMode === "none" || txPromos.length === 0) {
    plan = searchSingle(types, txPromos);
    splitMethod = "single";
  } else {
    try {
      plan = searchExact(types, txPromos, options.exactSearchBudget ?? DEFAULT_EXACT_SEARCH_BUDGET);
      splitMethod = "exact";
    } catch (e) {
      if (!(e instanceof BudgetExceeded)) throw e;
      plan = searchGreedy(types, txPromos);
      splitMethod = "greedy";
    }
  }

  const transactions = itemCount === 0 ? [] : toTransactions(plan, types, txPromos);
  const transactionDiscount = plan.discount;
  const discount = itemDiscount + transactionDiscount;
  const fee = computeFee(config.fee, itemCount);
  const netSubtotal = subtotal - itemDiscount;

  return {
    lines,
    itemCount,
    subtotal,
    itemDiscount,
    transactionDiscount,
    discount,
    fee,
    total: subtotal - discount + fee,
    compareAtTotal,
    savings: Math.max(0, compareAtTotal - (subtotal - discount)),
    transactions,
    itemPromos: applied,
    splitMethod,
    hint: itemCount === 0 ? null : findHint(txPromos, netSubtotal, transactionDiscount),
  };
}
