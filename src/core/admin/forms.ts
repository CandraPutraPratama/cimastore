import { z } from "zod";
import { normalizeWhatsapp } from "../orders/checkout";
import { FeeRulesSchema, PromoSchema, SplitModeSchema, type FeeRules, type SplitMode } from "../pricing/rules";
import { inspectQris, QrisError } from "../qris/qris";
import { localInputToIso } from "./datetime";

/**
 * Mengubah isi form admin (teks mentah dari FormData) menjadi data yang sudah divalidasi.
 * Hasil gagal berisi pesan per kolom dalam Bahasa Indonesia, siap ditampilkan di bawah kolomnya.
 */

export type FormValues = Record<string, string | string[] | undefined>;
export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const fail = (errors: FieldErrors): { ok: false; errors: FieldErrors } => ({ ok: false, errors });

function one(values: FormValues, key: string): string {
  const v = values[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function many(values: FormValues, key: string): string[] {
  const v = values[key];
  return (Array.isArray(v) ? v : v === undefined ? [] : [v]).map((s) => s.trim()).filter(Boolean);
}

function checked(values: FormValues, key: string): boolean {
  const v = one(values, key);
  return v === "on" || v === "true" || v === "1";
}

const INVALID = Symbol("invalid");

/** "35.000", "Rp 35.000", "35000" menjadi 35000. Kosong = null. Selain angka = INVALID. */
function integerOrNull(text: string): number | null | typeof INVALID {
  const s = text.replace(/^rp\.?\s*/i, "").replace(/[.,\s]/g, "");
  if (s === "") return null;
  if (!/^\d{1,9}$/.test(s)) return INVALID;
  return Number(s);
}

/** Membaca kolom angka opsional; mencatat error bila bukan angka. */
function readInt(values: FormValues, key: string, label: string, errors: FieldErrors, options: { min?: number; max?: number } = {}): number | null {
  const n = integerOrNull(one(values, key));
  if (n === INVALID) {
    errors[key] = `${label}: isi dengan angka saja.`;
    return null;
  }
  if (n !== null && options.min !== undefined && n < options.min) errors[key] = `${label}: minimal ${options.min.toLocaleString("id-ID")}.`;
  if (n !== null && options.max !== undefined && n > options.max) errors[key] = `${label}: maksimal ${options.max.toLocaleString("id-ID")}.`;
  return n;
}

// -----------------------------------------------------------------------------
// Fee
// -----------------------------------------------------------------------------

function readFee(values: FormValues, errors: FieldErrors): FeeRules | null {
  const type = one(values, "feeType");
  if (type === "none") return { type: "none" };
  if (type !== "per_item" && type !== "per_order") {
    errors.feeType = "Pilih jenis biaya jasa.";
    return null;
  }
  const amount = readInt(values, "feeAmount", "Biaya jasa", errors, { min: 0, max: 1_000_000 });
  if (amount === null && !errors.feeAmount) errors.feeAmount = "Isi nominal biaya jasa (boleh 0).";
  if (type === "per_order") {
    if (errors.feeAmount) return null;
    return FeeRulesSchema.parse({ type, amount });
  }
  const single = readInt(values, "feeSingleAmount", "Biaya untuk 1 item", errors, { min: 0, max: 1_000_000 });
  if (errors.feeAmount || errors.feeSingleAmount) return null;
  return FeeRulesSchema.parse({ type, amount, singleItemAmount: single });
}

// -----------------------------------------------------------------------------
// Brand
// -----------------------------------------------------------------------------

export interface BrandPatch {
  name: string;
  accent: string;
  splitMode: SplitMode;
  maxItemsPerOrder: number;
  feeRules: FeeRules;
  sortOrder: number;
}

export function parseBrandForm(values: FormValues): Parsed<BrandPatch> {
  const errors: FieldErrors = {};
  const name = one(values, "name").replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 60) errors.name = "Nama brand 1 sampai 60 huruf.";

  const accent = one(values, "accent");
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) errors.accent = "Warna harus berformat #RRGGBB, contoh #C8102E.";

  const split = SplitModeSchema.safeParse(one(values, "splitMode"));
  if (!split.success) errors.splitMode = "Pilih mode pemecahan transaksi.";

  const maxItems = readInt(values, "maxItemsPerOrder", "Maksimal item", errors, { min: 1, max: 100 });
  if (maxItems === null && !errors.maxItemsPerOrder) errors.maxItemsPerOrder = "Isi maksimal item per pesanan.";

  const sortOrder = readInt(values, "sortOrder", "Urutan", errors, { min: 0, max: 9999 });
  const fee = readFee(values, errors);

  if (Object.keys(errors).length > 0 || !split.success || maxItems === null || !fee) return fail(errors);
  return { ok: true, value: { name, accent: accent.toUpperCase(), splitMode: split.data, maxItemsPerOrder: maxItems, feeRules: fee, sortOrder: sortOrder ?? 0 } };
}

// -----------------------------------------------------------------------------
// Promo
// -----------------------------------------------------------------------------

export interface PromoToSave {
  id: string | null;
  name: string;
  level: "transaction" | "item";
  type: "percent" | "fixed";
  value: number;
  scope: "all_items" | "cheapest_item";
  appliesTo: "base_price" | "subtotal";
  maxDiscount: number | null;
  minSubtotal: number | null;
  minQty: number | null;
  maxQty: number | null;
  maxUsesPerOrder: number | null;
  maxUnits: number | null;
  productIds: string[] | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

const FIELD_OF_PATH: Record<string, string> = { productIds: "productIds", value: "value", minQty: "minQty" };

export function parsePromoForm(values: FormValues, options: { timeZone: string }): Parsed<PromoToSave> {
  const errors: FieldErrors = {};

  const name = one(values, "name").replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) errors.name = "Nama promo 1 sampai 80 huruf.";

  const level = one(values, "level");
  if (level !== "transaction" && level !== "item") errors.level = "Pilih jenis promo.";
  const type = one(values, "type");
  if (type !== "percent" && type !== "fixed") errors.type = "Pilih persen atau rupiah.";
  const scope = one(values, "scope") || "all_items";
  if (scope !== "all_items" && scope !== "cheapest_item") errors.scope = "Pilih cakupan potongan.";
  const appliesTo = one(values, "appliesTo") || "subtotal";
  if (appliesTo !== "base_price" && appliesTo !== "subtotal") errors.appliesTo = "Pilih dasar potongan.";

  const value = readInt(values, "value", "Nilai potongan", errors, { min: 1, max: 100_000_000 });
  if (value === null && !errors.value) errors.value = "Isi nilai potongan.";
  if (type === "percent" && value !== null && value > 100) errors.value = "Persen maksimal 100.";

  const maxDiscount = readInt(values, "maxDiscount", "Potongan maksimal", errors, { min: 1 });
  const minSubtotal = readInt(values, "minSubtotal", "Minimal belanja", errors, { min: 1 });
  const minQty = readInt(values, "minQty", "Minimal jumlah item", errors, { min: 1, max: 100 });
  const maxQty = readInt(values, "maxQty", "Maksimal jumlah item", errors, { min: 1, max: 100 });
  const maxUses = readInt(values, "maxUsesPerOrder", "Batas pemakaian per pesanan", errors, { min: 1, max: 100 });
  const maxUnits = readInt(values, "maxUnits", "Maksimal porsi", errors, { min: 1, max: 100 });

  const productIds = [...new Set(many(values, "productIds"))];

  const startsText = one(values, "startsAt");
  const endsText = one(values, "endsAt");
  const startsAt = startsText ? localInputToIso(startsText, options.timeZone) : null;
  const endsAt = endsText ? localInputToIso(endsText, options.timeZone) : null;
  if (startsText && !startsAt) errors.startsAt = "Tanggal mulai tidak valid.";
  if (endsText && !endsAt) errors.endsAt = "Tanggal selesai tidak valid.";
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) errors.endsAt = "Tanggal selesai harus setelah tanggal mulai.";

  if (Object.keys(errors).length > 0) return fail(errors);

  const candidate = {
    id: one(values, "id") || "baru",
    name,
    level,
    type,
    value,
    scope,
    appliesTo,
    maxDiscount,
    minSubtotal,
    minQty,
    maxQty,
    maxUsesPerOrder: maxUses,
    maxUnits: level === "item" ? maxUnits : null,
    productIds: productIds.length > 0 ? productIds : null,
    active: checked(values, "active"),
    startsAt,
    endsAt,
  };
  const parsed = PromoSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = FIELD_OF_PATH[String(issue.path[0])] ?? String(issue.path[0] ?? "name");
      errors[key] ??= issue.message;
    }
    return fail(errors);
  }
  const p = parsed.data;
  return {
    ok: true,
    value: {
      id: one(values, "id") || null,
      name: p.name,
      level: p.level,
      type: p.type,
      value: p.value,
      scope: p.scope,
      appliesTo: p.appliesTo,
      maxDiscount: p.maxDiscount,
      minSubtotal: p.minSubtotal,
      minQty: p.minQty,
      maxQty: p.maxQty,
      maxUsesPerOrder: p.maxUsesPerOrder,
      maxUnits: p.maxUnits,
      productIds: p.productIds,
      active: p.active,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
    },
  };
}

// -----------------------------------------------------------------------------
// Pengaturan situs
// -----------------------------------------------------------------------------

export interface SettingsPatch {
  openDays: number[];
  tentativeDays: number[];
  openTime: string;
  closeTime: string;
  whatsappNumber: string;
  paymentExpiryMinutes: number;
  announcement: string | null;
  emergencyClosed: boolean;
  /** Hanya ada bila diisi: payload QRIS statis yang baru. */
  qrisPayload?: string;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

function days(values: FormValues, key: string): number[] {
  return [...new Set(many(values, key).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
}

export function parseSettingsForm(values: FormValues): Parsed<SettingsPatch> {
  const errors: FieldErrors = {};

  const openDays = days(values, "openDays");
  // Hari yang dipilih buka dan tentatif sekaligus dianggap buka.
  const tentativeDays = days(values, "tentativeDays").filter((d) => !openDays.includes(d));
  if (openDays.length === 0) errors.openDays = "Pilih minimal satu hari buka.";

  const openTime = one(values, "openTime");
  const closeTime = one(values, "closeTime");
  if (!hhmm.safeParse(openTime).success) errors.openTime = "Jam buka tidak valid.";
  if (!hhmm.safeParse(closeTime).success) errors.closeTime = "Jam tutup tidak valid.";
  if (!errors.openTime && !errors.closeTime && openTime >= closeTime) errors.closeTime = "Jam tutup harus setelah jam buka.";

  const wa = normalizeWhatsapp(one(values, "whatsappNumber"));
  if (!wa) errors.whatsappNumber = "Nomor WhatsApp tidak valid. Contoh: 0877 9342 0768.";

  const expiry = readInt(values, "paymentExpiryMinutes", "Batas waktu bayar", errors, { min: 5, max: 240 });
  if (expiry === null && !errors.paymentExpiryMinutes) errors.paymentExpiryMinutes = "Isi batas waktu bayar dalam menit.";

  const announcementText = one(values, "announcement").replace(/\s+/g, " ");
  if (announcementText.length > 200) errors.announcement = "Pengumuman maksimal 200 huruf.";

  const qris = one(values, "qrisPayload").replace(/\s+/g, "");
  if (qris) {
    try {
      inspectQris(qris);
    } catch (error) {
      errors.qrisPayload = error instanceof QrisError ? error.message : "QRIS tidak valid.";
    }
  }

  if (Object.keys(errors).length > 0 || !wa || expiry === null) return fail(errors);
  return {
    ok: true,
    value: {
      openDays,
      tentativeDays,
      openTime,
      closeTime,
      whatsappNumber: wa,
      paymentExpiryMinutes: expiry,
      announcement: announcementText || null,
      emergencyClosed: checked(values, "emergencyClosed"),
      ...(qris ? { qrisPayload: qris } : {}),
    },
  };
}
