import { stemOf } from "../../src/core/catalog/photos";

export interface ProductInput {
  externalId: string;
  name: string;
  imageSourceUrl: string | null;
}

export interface ResolvedProductPhotoNaming {
  externalId: string;
  name: string;
  cleanName: string;
  code: string;
  baseFileName: string;
  isCollision: boolean;
}

const FORBIDDEN_WINDOWS_CHARS = /[\\/:*?"<>|]/g;

/** Membersihkan nama produk dari karakter terlarang Windows. */
export function cleanProductName(name: string): string {
  return name
    .replace(FORBIDDEN_WINDOWS_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

/** Mengambil nama file (basename) dari URL tanpa ekstensi. */
export function extractUrlBasename(url: string | null): string | null {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(last);
    const stem = stemOf(decoded);
    return stem || null;
  } catch {
    return null;
  }
}

/**
 * Menentukan penamaan file foto untuk daftar produk.
 * Format: `<kode> - <nama produk>`
 * Jika ada bentrok kode (basename URL sama), gunakan external_id sebagai kode.
 */
export function resolveProductPhotosNaming(products: ProductInput[]): ResolvedProductPhotoNaming[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    const raw = extractUrlBasename(p.imageSourceUrl)?.toLowerCase();
    if (raw) {
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }

  return products.map((p) => {
    const rawBasename = extractUrlBasename(p.imageSourceUrl);
    const rawLower = rawBasename?.toLowerCase();
    const isDuplicate = !!rawLower && (counts.get(rawLower) ?? 0) > 1;
    const hasForbiddenChars = !!rawBasename && FORBIDDEN_WINDOWS_CHARS.test(rawBasename);
    const hasSeparator = !!rawBasename && rawBasename.includes(" - ");

    // Gunakan external_id jika bentrok, URL tidak valid, mengandung separator " - ", atau karakter terlarang.
    const isCollision = !rawBasename || isDuplicate || hasForbiddenChars || hasSeparator;
    const code = isCollision ? cleanProductName(p.externalId) || p.externalId : rawBasename;
    const cleanName = cleanProductName(p.name) || code;
    const baseFileName = `${code} - ${cleanName}`;

    return {
      externalId: p.externalId,
      name: p.name,
      cleanName,
      code,
      baseFileName,
      isCollision,
    };
  });
}
