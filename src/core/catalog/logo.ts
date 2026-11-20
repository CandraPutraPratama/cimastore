import type { PhotoExtension } from "./photos";

/** Logo brand: dikenali dari isi file (bukan nama), supaya file palsu tidak masuk ke R2. */
export const MAX_LOGO_BYTES = 1_000_000;

export type LogoExtension = Extract<PhotoExtension, "png" | "jpg" | "webp">;

export function detectLogoType(bytes: Uint8Array): LogoExtension | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "png";
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpg";
  if (bytes.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return "webp";
  return null;
}

/** Kunci R2 untuk logo. Cocok dengan PHOTO_KEY_PATTERN, jadi rute /foto/ langsung bisa menayangkannya. */
export function logoKey(brandSlug: string, contentHash: string, ext: LogoExtension): string {
  return `${brandSlug}/logo.${contentHash.slice(0, 8)}.${ext}`;
}
