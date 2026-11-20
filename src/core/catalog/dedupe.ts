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

/** Hash 53-bit (cyrb53) yang stabil, untuk kode price list berbasis isi. */
function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Brand seperti Kopi Kenangan punya harga per outlet, tapi banyak outlet berbagi
 * harga yang persis sama. Fungsi ini menggabungkan price list yang isinya identik
 * supaya database tidak menyimpan ribuan salinan yang sama.
 *
 * Kode price list diturunkan dari ISINYA (`<prefix>-<hash>`): isi sama = kode sama.
 * Jadi saat import ulang, price list yang tidak berubah tidak perlu ditulis ulang;
 * price list baru hanya muncul bila ada harga yang benar-benar berubah.
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
      code = `${prefix}-${contentHash(key)}`;
      // Tabrakan hash hampir mustahil, tapi tetap dijaga agar kode selalu unik.
      while (priceLists.some((p) => p.code === code)) code = `${code}x`;
      codeByKey.set(key, code);
      priceLists.push({ code, ...content });
    }
    priceListByOutlet.set(outletCode, code);
  }

  return { priceLists, priceListByOutlet };
}
