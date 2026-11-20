import type { SnapshotPriceList } from "./snapshot";

export type PriceListContent = Omit<SnapshotPriceList, "code">;

function sortRecord<T>(record: Record<string, T>, map: (v: T) => unknown = (v) => v): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((k) => [k, map(record[k])]),
  );
}

function canonical(content: PriceListContent): string {
  return JSON.stringify({
    b: sortRecord(content.basePrices),
    c: sortRecord(content.compareAtBasePrices),
    o: sortRecord(content.optionDeltas, (v) => sortRecord(v)),
  });
}

/**
 * Brand seperti Kopi Kenangan punya harga per outlet, tapi banyak outlet berbagi
 * harga yang persis sama. Fungsi ini menggabungkan price list yang isinya identik
 * supaya database tidak menyimpan ribuan salinan yang sama.
 *
 * Kode price list dibuat berurutan (`<prefix>-1`, `<prefix>-2`, ...) mengikuti urutan
 * kemunculan pertama, jadi hasilnya stabil untuk input yang sama.
 */
export function dedupePriceLists(
  entries: Array<{ outletCode: string; content: PriceListContent }>,
  prefix: string,
): { priceLists: SnapshotPriceList[]; priceListByOutlet: Map<string, string> } {
  const codeByKey = new Map<string, string>();
  const priceLists: SnapshotPriceList[] = [];
  const priceListByOutlet = new Map<string, string>();

  for (const { outletCode, content } of entries) {
    const key = canonical(content);
    let code = codeByKey.get(key);
    if (!code) {
      code = `${prefix}-${priceLists.length + 1}`;
      codeByKey.set(key, code);
      priceLists.push({ code, ...content });
    }
    priceListByOutlet.set(outletCode, code);
  }

  return { priceLists, priceListByOutlet };
}
