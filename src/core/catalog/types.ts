/**
 * Bentuk katalog yang sudah "di-resolve" untuk satu outlet: harga dasar dan
 * tambahan harga opsi sudah memakai price list outlet tersebut.
 * Semua nominal adalah bilangan bulat rupiah.
 */

export type ProductStatus = "available" | "sold_out" | "hidden";

export interface ResolvedOption {
  id: string;
  name: string;
  /** Tambahan harga yang dibayar customer (harga jasdor). */
  priceDelta: number;
  /** Tambahan harga asli brand, untuk harga coret. Kosong = sama dengan priceDelta. */
  compareAtDelta?: number;
  isDefault?: boolean;
  /**
   * Opsi ini hanya boleh dipilih bila SALAH SATU opsi di daftar ini ikut dipilih
   * (misal topping "Pearl (L)" hanya untuk ukuran Large).
   */
  requiresAnyOf?: string[];
}

export interface ResolvedOptionGroup {
  id: string;
  name: string;
  /** single = pilih satu (radio), multiple = boleh lebih dari satu (checkbox). */
  selection: "single" | "multiple";
  /** Minimal opsi yang harus dipilih (0 = opsional). */
  min: number;
  /** Maksimal opsi yang boleh dipilih (null = tanpa batas). */
  max: number | null;
  options: ResolvedOption[];
}

export interface ResolvedProduct {
  id: string;
  name: string;
  basePrice: number;
  /** Harga dasar asli brand untuk harga coret. Kosong = sama dengan basePrice. */
  compareAtPrice?: number;
  status: ProductStatus;
  optionGroups: ResolvedOptionGroup[];
}
