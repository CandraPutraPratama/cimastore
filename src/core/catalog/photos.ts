/**
 * Mencocokkan berkas foto dengan produk. Murni: tidak membaca disk atau database.
 *
 * Aturan (berurutan, yang pertama cocok dipakai):
 *  1. Kode: bagian nama berkas sebelum " - " (atau seluruh nama) sama dengan kode foto di
 *     alamat foto sumber produk (CH20410116650 untuk .../chagee/CH20410116650.webp),
 *     atau sama dengan id produk.
 *  2. Nama: bagian setelah " - " (atau seluruh nama) sama dengan nama produk, mengabaikan
 *     huruf besar/kecil dan tanda baca.
 * Berkas yang tidak cocok, atau produk yang cocok dengan lebih dari satu berkas, dilaporkan
 * dan tidak diunggah: tidak ada tebakan.
 */

export const PHOTO_EXTENSIONS = ["webp", "jpg", "jpeg", "png", "avif"] as const;
export type PhotoExtension = (typeof PHOTO_EXTENSIONS)[number];

export interface PhotoProduct {
  externalId: string;
  name: string;
  imageSourceUrl: string | null;
}

export interface PhotoMatch {
  fileName: string;
  externalId: string;
  by: "kode" | "nama";
}

export interface PhotoMatchResult {
  matched: PhotoMatch[];
  /** Berkas yang tidak cocok produk mana pun (bukan gambar, atau logo, atau salah nama). */
  unmatchedFiles: string[];
  /** Produk yang cocok dengan lebih dari satu berkas; tidak ada yang dipakai. */
  ambiguous: Array<{ externalId: string; fileNames: string[] }>;
  /** Produk aktif tanpa foto setelah pencocokan. */
  productsWithoutPhoto: string[];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function photoExtension(fileName: string): PhotoExtension | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  return (PHOTO_EXTENSIONS as readonly string[]).includes(ext ?? "") ? (ext as PhotoExtension) : null;
}

function stemOf(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "").trim();
}

function sourceCode(url: string | null): string | null {
  if (!url) return null;
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "";
    return stemOf(decodeURIComponent(last)).toLowerCase() || null;
  } catch {
    return null;
  }
}

export function matchPhotos(fileNames: string[], products: PhotoProduct[]): PhotoMatchResult {
  const byCode = new Map<string, PhotoProduct>();
  const byName = new Map<string, PhotoProduct[]>();
  for (const p of products) {
    byCode.set(p.externalId.toLowerCase(), p);
    const code = sourceCode(p.imageSourceUrl);
    if (code) byCode.set(code, p);
    const n = normalize(p.name);
    byName.set(n, [...(byName.get(n) ?? []), p]);
  }

  const perProduct = new Map<string, PhotoMatch[]>();
  const unmatchedFiles: string[] = [];

  for (const fileName of [...fileNames].sort()) {
    if (!photoExtension(fileName)) {
      unmatchedFiles.push(fileName);
      continue;
    }
    const stem = stemOf(fileName);
    const sep = stem.indexOf(" - ");
    const head = sep >= 0 ? stem.slice(0, sep) : stem;
    const label = sep >= 0 ? stem.slice(sep + 3) : stem;

    let product = byCode.get(head.trim().toLowerCase());
    let by: PhotoMatch["by"] = "kode";
    if (!product) {
      const candidates = byName.get(normalize(label)) ?? [];
      if (candidates.length === 1) {
        product = candidates[0];
        by = "nama";
      }
    }
    if (!product) {
      unmatchedFiles.push(fileName);
      continue;
    }
    perProduct.set(product.externalId, [...(perProduct.get(product.externalId) ?? []), { fileName, externalId: product.externalId, by }]);
  }

  const matched: PhotoMatch[] = [];
  const ambiguous: PhotoMatchResult["ambiguous"] = [];
  for (const [externalId, list] of perProduct) {
    if (list.length === 1) matched.push(list[0]);
    else ambiguous.push({ externalId, fileNames: list.map((m) => m.fileName) });
  }
  const covered = new Set(perProduct.keys());
  return {
    matched,
    unmatchedFiles,
    ambiguous,
    productsWithoutPhoto: products.filter((p) => !covered.has(p.externalId)).map((p) => p.name),
  };
}

/** Kunci objek di R2. Memuat hash isi file, jadi foto yang diganti otomatis punya alamat baru (cache aman). */
export function photoKey(brandSlug: string, externalId: string, contentHash: string, ext: PhotoExtension): string {
  const safeId = externalId.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "x";
  return `${brandSlug}/${safeId}.${contentHash.slice(0, 8)}.${ext === "jpeg" ? "jpg" : ext}`;
}

export const PHOTO_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9_-]+\.[a-f0-9]{8}\.(?:webp|jpg|png|avif)$/;

export const PHOTO_CONTENT_TYPE: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
};
