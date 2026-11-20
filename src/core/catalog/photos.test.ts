import { describe, expect, it } from "vitest";
import { matchPhotos, PHOTO_KEY_PATTERN, photoExtension, photoKey, type PhotoProduct } from "./photos";

const products: PhotoProduct[] = [
  { externalId: "1", name: "Da Hong Pao Milk Tea", imageSourceUrl: "https://cdn.test/menu/chagee/CH204101.webp" },
  { externalId: "2", name: "BO•YA Jasmine Green Milk Tea", imageSourceUrl: "https://cdn.test/menu/chagee/CH204102.webp" },
  { externalId: "3", name: "Earl Grey Brewed Tea", imageSourceUrl: null },
];

describe("matchPhotos", () => {
  it("mencocokkan lewat kode foto sumber", () => {
    const r = matchPhotos(["CH204101 - nama apa saja.webp", "CH204102.webp"], products);
    expect(r.matched).toEqual([
      { fileName: "CH204101 - nama apa saja.webp", externalId: "1", by: "kode" },
      { fileName: "CH204102.webp", externalId: "2", by: "kode" },
    ]);
  });

  it("jatuh ke nama produk (abaikan besar kecil dan tanda baca) bila kode tidak ada", () => {
    const r = matchPhotos(["earl grey brewed tea.jpg", "X1 - BO.YA Jasmine Green Milk Tea.png"], products);
    expect(r.matched.map((m) => [m.externalId, m.by]).sort()).toEqual([
      ["2", "nama"],
      ["3", "nama"],
    ]);
  });

  it("id produk juga dikenali sebagai kode", () => {
    expect(matchPhotos(["3.webp"], products).matched[0].externalId).toBe("3");
  });

  it("melaporkan berkas tak cocok, bukan gambar, dan produk tanpa foto", () => {
    const r = matchPhotos(["brand-chagee.png", "catatan.txt", "CH204101.webp"], products);
    expect(r.unmatchedFiles).toEqual(["brand-chagee.png", "catatan.txt"]);
    expect(r.productsWithoutPhoto).toEqual(["BO•YA Jasmine Green Milk Tea", "Earl Grey Brewed Tea"]);
  });

  it("dua berkas untuk satu produk dilaporkan ambigu dan tidak dipakai", () => {
    const r = matchPhotos(["CH204101.webp", "CH204101 - Da Hong Pao Milk Tea.jpg"], products);
    expect(r.matched).toEqual([]);
    expect(r.ambiguous).toEqual([{ externalId: "1", fileNames: ["CH204101 - Da Hong Pao Milk Tea.jpg", "CH204101.webp"] }]);
  });

  it("nama produk kembar tidak ditebak", () => {
    const twins = [
      { externalId: "a", name: "Teh", imageSourceUrl: null },
      { externalId: "b", name: "Teh", imageSourceUrl: null },
    ];
    expect(matchPhotos(["Teh.jpg"], twins).unmatchedFiles).toEqual(["Teh.jpg"]);
  });
});

describe("photoKey", () => {
  it("memuat hash dan lolos pola kunci yang diterima rute foto", () => {
    const key = photoKey("chagee", "3673254", "ab12cd34ef56", "webp");
    expect(key).toBe("chagee/3673254.ab12cd34.webp");
    expect(PHOTO_KEY_PATTERN.test(key)).toBe(true);
  });
  it("membersihkan id aneh dan menormalkan jpeg", () => {
    const key = photoKey("mixue", "es krim/1", "00000000aa", "jpeg");
    expect(key).toBe("mixue/es_krim_1.00000000.jpg");
    expect(PHOTO_KEY_PATTERN.test(key)).toBe(true);
  });
  it("pola menolak penelusuran folder", () => {
    for (const bad of ["../x.12345678.webp", "chagee/../x.12345678.webp", "chagee/a/b.12345678.webp", "chagee/x.webp"]) {
      expect(PHOTO_KEY_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("photoExtension", () => {
  it("mengenali gambar saja", () => {
    expect(photoExtension("a.WEBP")).toBe("webp");
    expect(photoExtension("a.txt")).toBeNull();
    expect(photoExtension("a")).toBeNull();
  });
});
