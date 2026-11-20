import { describe, expect, it } from "vitest";
import { matchPhotos } from "../src/core/catalog/photos";
import {
  cleanProductName,
  extractUrlBasename,
  resolveProductPhotosNaming,
  type ProductInput,
} from "../scripts/lib/photo-naming";

describe("cleanProductName", () => {
  it("membersihkan karakter terlarang Windows dan merapikan spasi", () => {
    expect(cleanProductName('Kopi / Susu : "Mantan" * ? < > |')).toBe("Kopi Susu Mantan");
    expect(cleanProductName("Americano / Long Black")).toBe("Americano Long Black");
    expect(cleanProductName("Latte...")).toBe("Latte");
    expect(cleanProductName("  Double   Espresso  ")).toBe("Double Espresso");
  });
});

describe("extractUrlBasename", () => {
  it("mengekstrak nama file tanpa ekstensi dari URL", () => {
    expect(extractUrlBasename("https://static.fore.coffee/product/Espresso.jpg")).toBe("Espresso");
    expect(extractUrlBasename("https://cdn.kopikenangan.com/public/36155ddd-784d-a7d9")).toBe("36155ddd-784d-a7d9");
    expect(
      extractUrlBasename(
        "https://d2p4bcozn2acsk.cloudfront.net/product-group/0382b46a/1745312457_3aced35f.png"
      )
    ).toBe("1745312457_3aced35f");
  });

  it("menangani URL dengan query string dan encoding", () => {
    expect(extractUrlBasename("https://example.com/Butterscotch%20Latte.jpg?v=2")).toBe("Butterscotch Latte");
    expect(extractUrlBasename(null)).toBeNull();
    expect(extractUrlBasename("bukan-url")).toBeNull();
  });
});

describe("resolveProductPhotosNaming", () => {
  it("menggunakan basename URL jika tidak ada bentrok", () => {
    const products: ProductInput[] = [
      { externalId: "1", name: "Americano", imageSourceUrl: "https://cdn.test/menu/americano.jpg" },
      { externalId: "2", name: "Latte", imageSourceUrl: "https://cdn.test/menu/latte.webp" },
    ];
    const resolved = resolveProductPhotosNaming(products);
    expect(resolved[0].code).toBe("americano");
    expect(resolved[0].baseFileName).toBe("americano - Americano");
    expect(resolved[0].isCollision).toBe(false);

    expect(resolved[1].code).toBe("latte");
    expect(resolved[1].baseFileName).toBe("latte - Latte");
    expect(resolved[1].isCollision).toBe(false);

    // Pastikan cocok dengan matchPhotos
    const match = matchPhotos(["americano - Americano.jpg", "latte - Latte.webp"], products);
    expect(match.matched.length).toBe(2);
    expect(match.ambiguous.length).toBe(0);
  });

  it("menggunakan external_id bila dua produk punya basename sama (bentrok)", () => {
    const products: ProductInput[] = [
      { externalId: "ext-1", name: "Kopi Kenangan Mantan Regular", imageSourceUrl: "https://cdn.test/mantan.jpg" },
      { externalId: "ext-2", name: "Kopi Kenangan Mantan Large", imageSourceUrl: "https://cdn.test/mantan.jpg" },
    ];
    const resolved = resolveProductPhotosNaming(products);
    expect(resolved[0].isCollision).toBe(true);
    expect(resolved[0].code).toBe("ext-1");
    expect(resolved[0].baseFileName).toBe("ext-1 - Kopi Kenangan Mantan Regular");

    expect(resolved[1].isCollision).toBe(true);
    expect(resolved[1].code).toBe("ext-2");
    expect(resolved[1].baseFileName).toBe("ext-2 - Kopi Kenangan Mantan Large");

    // Pastikan cocok dengan matchPhotos lewat kode external_id
    const match = matchPhotos(
      [
        "ext-1 - Kopi Kenangan Mantan Regular.jpg",
        "ext-2 - Kopi Kenangan Mantan Large.jpg",
      ],
      products
    );
    expect(match.matched.length).toBe(2);
    expect(match.ambiguous.length).toBe(0);
    expect(match.matched[0].externalId).toBe("ext-1");
    expect(match.matched[1].externalId).toBe("ext-2");
  });

  it("menggunakan external_id bila URL null atau tidak valid", () => {
    const products: ProductInput[] = [
      { externalId: "p3", name: "Teh Tarik", imageSourceUrl: null },
    ];
    const resolved = resolveProductPhotosNaming(products);
    expect(resolved[0].isCollision).toBe(true);
    expect(resolved[0].code).toBe("p3");
    expect(resolved[0].baseFileName).toBe("p3 - Teh Tarik");

    const match = matchPhotos(["p3 - Teh Tarik.png"], products);
    expect(match.matched.length).toBe(1);
    expect(match.matched[0].externalId).toBe("p3");
  });
});
