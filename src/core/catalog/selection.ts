import type { ResolvedOption, ResolvedProduct } from "./types";

/** Pilihan customer untuk satu baris keranjang. */
export interface LineSelection {
  productId: string;
  quantity: number;
  optionIds: string[];
  note?: string;
}

export interface PricedLineOption {
  id: string;
  groupName: string;
  name: string;
  priceDelta: number;
}

/** Satu baris keranjang yang sudah divalidasi dan dihitung harganya per porsi. */
export interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  basePrice: number;
  optionsPrice: number;
  /** basePrice + optionsPrice. */
  unitPrice: number;
  /** Harga asli brand per porsi (untuk harga coret dan "kamu hemat"). */
  compareAtUnitPrice: number;
  options: PricedLineOption[];
  note?: string;
}

export type SelectionErrorCode =
  | "PRODUCT_MISMATCH"
  | "PRODUCT_UNAVAILABLE"
  | "INVALID_QUANTITY"
  | "UNKNOWN_OPTION"
  | "DUPLICATE_OPTION"
  | "GROUP_MIN"
  | "GROUP_MAX"
  | "OPTION_REQUIRES";

export interface SelectionError {
  code: SelectionErrorCode;
  message: string;
  groupId?: string;
  optionId?: string;
}

export type PriceLineResult =
  | { ok: true; line: PricedLine }
  | { ok: false; errors: SelectionError[] };

export const MAX_QUANTITY_PER_LINE = 50;

/**
 * Memvalidasi pilihan opsi customer terhadap aturan produk lalu menghitung harga per porsi.
 * Dipakai di browser (tampilan) dan di server (sumber kebenaran).
 */
export function priceLine(product: ResolvedProduct, selection: LineSelection): PriceLineResult {
  const errors: SelectionError[] = [];

  if (selection.productId !== product.id) {
    return {
      ok: false,
      errors: [{ code: "PRODUCT_MISMATCH", message: "Produk tidak sesuai dengan pilihan." }],
    };
  }

  if (product.status !== "available") {
    errors.push({
      code: "PRODUCT_UNAVAILABLE",
      message: `${product.name} sedang tidak tersedia.`,
    });
  }

  if (
    !Number.isInteger(selection.quantity) ||
    selection.quantity < 1 ||
    selection.quantity > MAX_QUANTITY_PER_LINE
  ) {
    errors.push({
      code: "INVALID_QUANTITY",
      message: `Jumlah harus antara 1 dan ${MAX_QUANTITY_PER_LINE}.`,
    });
  }

  const chosen = new Set<string>();
  for (const id of selection.optionIds) {
    if (chosen.has(id)) {
      errors.push({ code: "DUPLICATE_OPTION", message: "Opsi dipilih lebih dari sekali.", optionId: id });
    }
    chosen.add(id);
  }

  const optionIndex = new Map<string, { option: ResolvedOption; groupName: string }>();
  for (const group of product.optionGroups) {
    for (const option of group.options) {
      optionIndex.set(option.id, { option, groupName: group.name });
    }
  }

  for (const id of chosen) {
    if (!optionIndex.has(id)) {
      errors.push({ code: "UNKNOWN_OPTION", message: "Opsi tidak dikenal untuk produk ini.", optionId: id });
    }
  }

  for (const group of product.optionGroups) {
    const count = group.options.filter((o) => chosen.has(o.id)).length;
    const max = group.selection === "single" ? 1 : group.max;
    if (count < group.min) {
      errors.push({
        code: "GROUP_MIN",
        message:
          group.min === 1 ? `Pilih ${group.name}.` : `Pilih minimal ${group.min} ${group.name}.`,
        groupId: group.id,
      });
    }
    if (max !== null && count > max) {
      errors.push({
        code: "GROUP_MAX",
        message: `${group.name} maksimal ${max} pilihan.`,
        groupId: group.id,
      });
    }
  }

  for (const id of chosen) {
    const entry = optionIndex.get(id);
    const requires = entry?.option.requiresAnyOf;
    if (requires && requires.length > 0 && !requires.some((r) => chosen.has(r))) {
      errors.push({
        code: "OPTION_REQUIRES",
        message: `${entry.option.name} tidak tersedia untuk pilihan ini.`,
        optionId: id,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Urutan opsi mengikuti urutan grup & opsi di katalog, bukan urutan klik customer.
  const options: PricedLineOption[] = [];
  let optionsPrice = 0;
  let compareAtOptions = 0;
  for (const group of product.optionGroups) {
    for (const option of group.options) {
      if (!chosen.has(option.id)) continue;
      options.push({
        id: option.id,
        groupName: group.name,
        name: option.name,
        priceDelta: option.priceDelta,
      });
      optionsPrice += option.priceDelta;
      compareAtOptions += option.compareAtDelta ?? option.priceDelta;
    }
  }

  const note = selection.note?.trim();
  return {
    ok: true,
    line: {
      productId: product.id,
      name: product.name,
      quantity: selection.quantity,
      basePrice: product.basePrice,
      optionsPrice,
      unitPrice: product.basePrice + optionsPrice,
      compareAtUnitPrice: (product.compareAtPrice ?? product.basePrice) + compareAtOptions,
      options,
      ...(note ? { note } : {}),
    },
  };
}
