import { describe, expect, it } from "vitest";
import { buildSnapshotFromCsv, parseCsv, parseRupiahText, slugify, type CsvImportInput } from "./csv";

const base = (over: Partial<CsvImportInput> = {}): CsvImportInput => ({
  brandSlug: "mcd",
  outletMode: "customer_input",
  menuCsv: "kategori,nama,harga\nBurger,Big Mac,45000\nMinuman,Cola,12000\n",
  existing: { categories: [], products: [], outletCodes: [], priceListCodes: [] },
  now: "2026-11-21T00:00:00+07:00",
  source: "csv:menu.csv",
  ...over,
});

describe("parseCsv", () => {
  it("mengenali koma, titik koma, dan tab", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("mendukung kutip, kutip ganda, baris baru di dalam kutip, CRLF dan BOM", () => {
    const rows = parseCsv('﻿nama,ket\r\n"Es, Teh","dia bilang ""halo""\nbaris dua"\r\n');
    expect(rows).toEqual([["nama", "ket"], ["Es, Teh", 'dia bilang "halo"\nbaris dua']]);
  });
  it("koma di dalam kutip tidak ikut menentukan pemisah", () => {
    expect(parseCsv('"a,b";c\n1;2')).toEqual([["a,b", "c"], ["1", "2"]]);
  });
});

describe("parseRupiahText", () => {
  it.each([
    ["35000", 35000],
    ["35.000", 35000],
    ["Rp 35.000", 35000],
    ["rp35.000", 35000],
    ["35.000,00", 35000],
    ["35000.00", 35000],
  ])("%s -> %s", (text, expected) => expect(parseRupiahText(text)).toBe(expected));
  it.each(["", "abc", "-5", "12.5x", "1234567890"])("menolak %j", (text) => expect(parseRupiahText(text)).toBeNull());
});

describe("slugify", () => {
  it("membersihkan aksen dan simbol", () => {
    expect(slugify("  Es Kopi Susu (Large)! ")).toBe("es-kopi-susu-large");
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });
});

describe("buildSnapshotFromCsv: menu", () => {
  it("membuat snapshot valid dengan satu price list dan outlet 'menu' untuk brand customer_input", () => {
    const r = buildSnapshotFromCsv(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.products.map((p) => p.name)).toEqual(["Big Mac", "Cola"]);
    expect(r.snapshot.categories.map((c) => c.name)).toEqual(["Burger", "Minuman"]);
    expect(r.snapshot.priceLists).toHaveLength(1);
    expect(Object.values(r.snapshot.priceLists[0].basePrices)).toEqual([45000, 12000]);
    expect(r.snapshot.outlets.map((o) => o.code)).toEqual(["menu"]);
    expect(r.options).toEqual({ syncOutlets: true, rewritePriceLists: true, replaceOptions: false });
    expect(r.preview).toMatchObject({ categories: 2, products: 2, newProducts: 2, updatedProducts: 0, missingProducts: 0 });
  });

  it("menerima judul kolom Indonesia/Inggris, urutan bebas, dan titik koma", () => {
    const r = buildSnapshotFromCsv(base({ menuCsv: "Price;Produk;Category;Foto\n10.000;Teh;Minum;https://x.test/a.jpg\n" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.products[0]).toMatchObject({ name: "Teh", imageUrl: "https://x.test/a.jpg" });
  });

  it("memakai id yang sama untuk produk dan kategori yang sudah ada (impor ulang tidak menggandakan)", () => {
    const r = buildSnapshotFromCsv(
      base({
        existing: {
          categories: [{ externalId: "c-abc", name: "burger" }],
          products: [{ externalId: "p-xyz", name: "BIG MAC", category: "Burger", isActive: true }],
          outletCodes: ["menu"],
          priceListCodes: ["pl-lama"],
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.categories[0].id).toBe("c-abc");
    expect(r.snapshot.products[0].id).toBe("p-xyz");
    expect(r.snapshot.priceLists[0].code).toBe("pl-lama");
    expect(r.preview).toMatchObject({ newProducts: 1, updatedProducts: 1 });
  });

  it("kolom kode menjadi id produk", () => {
    const r = buildSnapshotFromCsv(base({ menuCsv: "kode,kategori,nama,harga\nBM-1,Burger,Big Mac,45000\n" }));
    expect(r.ok && r.snapshot.products[0].id).toBe("BM-1");
  });

  it("menghitung produk aktif yang tidak ada di file", () => {
    const r = buildSnapshotFromCsv(
      base({
        existing: {
          categories: [],
          products: [
            { externalId: "p-1", name: "Lama", category: "Burger", isActive: true },
            { externalId: "p-2", name: "Mati", category: "Burger", isActive: false },
          ],
          outletCodes: [],
          priceListCodes: [],
        },
      }),
    );
    expect(r.ok && r.preview.missingProducts).toBe(1);
  });

  it("melaporkan semua kesalahan baris dengan nomor barisnya", () => {
    const r = buildSnapshotFromCsv(
      base({
        menuCsv: "kategori,nama,harga,foto\nBurger,,45000,\n,Cola,12000,\nMinum,Teh,abc,\nMinum,Es,5000,bukan-url\nMinum,Es,5000,\nMinum,es,6000,\n",
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const msgs = r.issues.map((i) => `${i.line}:${i.message}`);
    expect(msgs).toContain("2:Nama kosong.");
    expect(msgs).toContain("3:Kategori kosong.");
    expect(msgs.some((m) => m.startsWith('4:Harga "abc"'))).toBe(true);
    expect(msgs.some((m) => m.startsWith("5:Foto harus"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("7:Produk ganda"))).toBe(true);
  });

  it("menolak file tanpa kolom wajib atau tanpa produk", () => {
    expect(buildSnapshotFromCsv(base({ menuCsv: "kategori,nama\nA,B\n" })).ok).toBe(false);
    expect(buildSnapshotFromCsv(base({ menuCsv: "kategori,nama,harga\n" })).ok).toBe(false);
    expect(buildSnapshotFromCsv(base({ menuCsv: "" })).ok).toBe(false);
  });

  it("menolak brand dengan banyak price list", () => {
    const r = buildSnapshotFromCsv(base({ existing: { categories: [], products: [], outletCodes: [], priceListCodes: ["a", "b"] } }));
    expect(r.ok).toBe(false);
  });

  it("kode produk ganda ditolak", () => {
    const r = buildSnapshotFromCsv(base({ menuCsv: "kode,kategori,nama,harga\nX,A,Satu,1000\nX,A,Dua,2000\n" }));
    expect(r.ok).toBe(false);
  });
});

describe("buildSnapshotFromCsv: outlet", () => {
  const catalog = (over: Partial<CsvImportInput> = {}) => base({ outletMode: "catalog", brandSlug: "mixue", ...over });

  it("tanpa file outlet: outlet lama tidak disentuh", () => {
    const r = buildSnapshotFromCsv(catalog({ existing: { categories: [], products: [], outletCodes: ["a"], priceListCodes: [] } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.syncOutlets).toBe(false);
    expect(r.snapshot.outlets).toEqual([]);
    expect(r.preview.warnings).toEqual([]);
  });

  it("memperingatkan bila brand katalog belum punya outlet sama sekali", () => {
    const r = buildSnapshotFromCsv(catalog());
    expect(r.ok && r.preview.warnings.length).toBe(1);
  });

  it("membaca outlet lengkap dengan jam dan koordinat", () => {
    const r = buildSnapshotFromCsv(
      catalog({
        outletsCsv: "kode;nama;kota;buka;tutup;lat;lng\nSBY-1;Mixue Tunjungan;Surabaya;9.00;22:00;-7,26;112,74\nSBY-2;Mixue Darmo;Surabaya;;;;\n",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.outlets[0]).toMatchObject({ code: "SBY-1", hours: { open: "09:00", close: "22:00" }, lat: -7.26, lng: 112.74 });
    expect(r.snapshot.outlets[1].hours).toBeNull();
    expect(r.options.syncOutlets).toBe(true);
    expect(r.preview).toMatchObject({ outlets: 2, newOutlets: 2 });
  });

  it("menghitung outlet lama yang tidak ada di file", () => {
    const r = buildSnapshotFromCsv(
      catalog({ outletsCsv: "kode,nama\nA,Satu\n", existing: { categories: [], products: [], outletCodes: ["A", "B", "C"], priceListCodes: [] } }),
    );
    expect(r.ok && r.preview).toMatchObject({ newOutlets: 0, missingOutlets: 2 });
  });

  it("menolak jam tak berpasangan, koordinat salah, dan kode ganda", () => {
    const r = buildSnapshotFromCsv(
      catalog({ outletsCsv: "kode,nama,buka,tutup,lat,lng\nA,Satu,08:00,,,\nB,Dua,,,999,10\nB,Tiga,,,,\n" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.line)).toEqual([2, 3, 4]);
  });

  it("brand customer_input menolak file outlet", () => {
    const r = buildSnapshotFromCsv(base({ outletsCsv: "kode,nama\nA,Satu\n" }));
    expect(r.ok).toBe(false);
  });
});
