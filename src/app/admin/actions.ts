"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBrandCreateForm, parseBrandForm, parseProductForm, parsePromoForm, parseSettingsForm, type FieldErrors, type FormValues } from "@/core/admin/forms";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { detectLogoType, logoKey, MAX_LOGO_BYTES } from "@/core/catalog/logo";
import { PHOTO_CONTENT_TYPE } from "@/core/catalog/photos";
import { buildSnapshotFromCsv, MAX_CSV_CHARS, type CsvIssue, type CsvPreview } from "@/core/catalog/csv";
import { STATUS_LABEL, type OrderStatus } from "@/core/orders/status";
import { loginWithPassword, logout, requireAdmin } from "@/server/admin/auth";
import {
  adminTransition,
  createBrand,
  deletePromo,
  getCatalogContext,
  getProduct,
  getSettings,
  importCatalog,
  markRefundDone,
  saveProduct,
  savePromo,
  setProductVisible,
  setPromoActive,
  updateBrand,
  updateSettings,
} from "@/server/admin/data";

/**
 * Semua aksi panel admin. Setiap aksi memeriksa sesi sendiri (requireAdmin): form bisa dikirim
 * langsung ke aksi tanpa melewati halaman, jadi halaman yang terkunci saja tidak cukup.
 */

export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Isi form yang dikirim, supaya tidak hilang saat ada kesalahan. */
  values?: FormValues;
}

function toValues(formData: FormData): FormValues {
  const out: FormValues = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

const refreshAll = () => revalidatePath("/admin", "layout");

export async function loginAction(_: FormState | undefined, formData: FormData): Promise<FormState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password === "") return { message: "Isi password." };
  const result = await loginWithPassword(password);
  if (!result.ok) return { message: result.message };
  redirect("/admin/pesanan");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Pesanan
// ---------------------------------------------------------------------------

export async function changeOrderStatusAction(id: string, to: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!(to in STATUS_LABEL)) return;
  const reason = formData.get("reason");
  const result = await adminTransition(id, to as OrderStatus, typeof reason === "string" ? reason : undefined);
  refreshAll();
  const flash = !result ? "tidak-ada" : result.kind === "rejected" ? "ditolak" : "status";
  redirect(`/admin/pesanan/${id}?info=${flash}`);
}

export async function refundDoneAction(id: string): Promise<void> {
  await requireAdmin();
  await markRefundDone(id);
  refreshAll();
  redirect(`/admin/pesanan/${id}?info=refund`);
}

// ---------------------------------------------------------------------------
// Brand dan promo
// ---------------------------------------------------------------------------

export async function saveBrandAction(slug: string, _: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = toValues(formData);
  const parsed = parseBrandForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Ada isian yang perlu dibetulkan." };
  const updated = await updateBrand(slug, parsed.value);
  if (!updated) return { values, message: "Brand tidak ditemukan." };
  refreshAll();
  return { ok: true, values, message: "Pengaturan brand disimpan." };
}

export async function saveBrandLogoAction(slug: string, _: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  if (formData.get("aksi") === "hapus") {
    const updated = await updateBrand(slug, { logoUrl: null });
    if (!updated) return { message: "Brand tidak ditemukan." };
    refreshAll();
    return { ok: true, message: "Logo dihapus. Kartu brand kembali memakai huruf." };
  }
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { message: "Pilih file logo dulu." };
  if (file.size > MAX_LOGO_BYTES) return { message: "Logo terlalu besar. Maksimal 1 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = detectLogoType(bytes);
  if (!ext) return { message: "Format logo harus PNG, JPG, atau WebP." };
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
  const key = logoKey(slug, hash, ext);
  await getCloudflareContext().env.FOTO.put(key, bytes, { httpMetadata: { contentType: PHOTO_CONTENT_TYPE[ext] } });
  const updated = await updateBrand(slug, { logoUrl: `/foto/${key}` });
  if (!updated) return { message: "Brand tidak ditemukan." };
  refreshAll();
  return { ok: true, message: "Logo disimpan." };
}

export async function setBrandActiveAction(slug: string, active: boolean): Promise<void> {
  await requireAdmin();
  await updateBrand(slug, { isActive: active });
  refreshAll();
  redirect(`/admin/brand?info=${active ? "aktif" : "nonaktif"}`);
}

export async function savePromoAction(slug: string, _: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = toValues(formData);
  const { timeZone } = await getSettings();
  const parsed = parsePromoForm(values, { timeZone });
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Ada isian yang perlu dibetulkan." };
  const result = await savePromo(slug, parsed.value);
  if (!result.ok) {
    const message =
      result.error === "PRODUCT_NOT_FOUND"
        ? "Ada produk yang dipilih tidak ditemukan. Muat ulang halaman lalu coba lagi."
        : result.error === "PROMO_NOT_FOUND"
          ? "Promo tidak ditemukan. Mungkin sudah dihapus."
          : "Brand tidak ditemukan.";
    return { values, message };
  }
  refreshAll();
  redirect(`/admin/brand/${slug}?info=promo-disimpan`);
}

export async function setPromoActiveAction(slug: string, id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await setPromoActive(slug, id, active);
  refreshAll();
  redirect(`/admin/brand/${slug}?info=${active ? "promo-aktif" : "promo-nonaktif"}`);
}

export async function deletePromoAction(slug: string, id: string): Promise<void> {
  await requireAdmin();
  await deletePromo(slug, id);
  refreshAll();
  redirect(`/admin/brand/${slug}?info=promo-dihapus`);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export async function setProductVisibleAction(slug: string, id: string, visible: boolean): Promise<void> {
  await requireAdmin();
  await setProductVisible(slug, id, visible);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Pengaturan situs
// ---------------------------------------------------------------------------

export async function saveSettingsAction(_: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = toValues(formData);
  // Payload QRIS tidak ditampilkan ulang di form; kolom kosong berarti tidak diubah.
  const parsed = parseSettingsForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Ada isian yang perlu dibetulkan." };
  await updateSettings(parsed.value);
  refreshAll();
  revalidatePath("/", "layout");
  return { ok: true, values: { ...values, qrisPayload: "" }, message: "Pengaturan disimpan." };
}

// ---------------------------------------------------------------------------
// Brand baru
// ---------------------------------------------------------------------------

export async function createBrandAction(_: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = toValues(formData);
  const parsed = parseBrandCreateForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Ada isian yang perlu dibetulkan." };
  const result = await createBrand(parsed.value);
  if (!result.ok) {
    if (result.error === "SLUG_TAKEN") return { errors: { slug: "Alamat ini sudah dipakai brand lain." }, values, message: "Ada isian yang perlu dibetulkan." };
    if (result.error === "PREFIX_TAKEN") return { errors: { prefix: "Kode pesanan ini sudah dipakai brand lain." }, values, message: "Ada isian yang perlu dibetulkan." };
    return { values, message: "Brand gagal dibuat. Periksa isiannya lalu coba lagi." };
  }
  refreshAll();
  redirect(`/admin/brand/${parsed.value.slug}?info=brand-dibuat`);
}

// ---------------------------------------------------------------------------
// Produk
// ---------------------------------------------------------------------------

export async function saveProductAction(slug: string, id: string | null, _: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = toValues(formData);
  let priceEditable = true;
  if (id) {
    const current = await getProduct(slug, id);
    if (!current) return { values, message: "Produk tidak ditemukan. Mungkin sudah dihapus." };
    priceEditable = current.priceListCount <= 1;
  } else {
    const ctx = await getCatalogContext(slug);
    if (!ctx) return { values, message: "Brand tidak ditemukan." };
    if (ctx.priceListCodes.length > 1) return { values, message: "Brand ini punya harga berbeda per outlet. Produk baru ditambahkan lewat impor data brand." };
  }
  const parsed = parseProductForm(values, { id, priceEditable });
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Ada isian yang perlu dibetulkan." };
  const result = await saveProduct(slug, parsed.value);
  if (!result.ok) {
    const message =
      result.error === "MULTI_PRICE_LIST"
        ? "Brand ini punya harga berbeda per outlet, harga tidak bisa diubah dari sini."
        : result.error === "PRODUCT_NOT_FOUND"
          ? "Produk tidak ditemukan. Mungkin sudah dihapus."
          : "Produk gagal disimpan. Periksa isiannya lalu coba lagi.";
    return { values, message };
  }
  refreshAll();
  revalidatePath("/", "layout");
  redirect(`/admin/brand/${slug}/menu?info=produk-disimpan`);
}

// ---------------------------------------------------------------------------
// Impor CSV
// ---------------------------------------------------------------------------

export interface CsvFormState {
  ok?: boolean;
  message?: string;
  issues?: CsvIssue[];
  preview?: CsvPreview;
  /** Isi file yang sudah diperiksa; dikirim balik lewat kolom tersembunyi untuk langkah "Impor". */
  menuText?: string;
  outletText?: string;
  deactivateMissing?: boolean;
}

async function readCsvField(formData: FormData, fileKey: string, textKey: string): Promise<{ text: string; tooBig: boolean }> {
  const file = formData.get(fileKey);
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_CHARS * 2) return { text: "", tooBig: true };
    return { text: await file.text(), tooBig: false };
  }
  const text = formData.get(textKey);
  return { text: typeof text === "string" ? text : "", tooBig: false };
}

/** Langkah 1 ("periksa") dan langkah 2 ("impor") memakai fungsi yang sama; data selalu diperiksa ulang di server. */
export async function csvImportAction(slug: string, _: CsvFormState | undefined, formData: FormData): Promise<CsvFormState> {
  await requireAdmin();
  const intent = formData.get("intent") === "impor" ? "impor" : "periksa";
  const deactivateMissing = formData.get("deactivateMissing") === "on";
  const menu = await readCsvField(formData, "menuFile", "menuText");
  const outlet = await readCsvField(formData, "outletFile", "outletText");
  const common = { deactivateMissing, menuText: menu.text, outletText: outlet.text };

  if (menu.tooBig || outlet.tooBig || menu.text.length > MAX_CSV_CHARS || outlet.text.length > MAX_CSV_CHARS) {
    return { message: "File terlalu besar (maksimal 1 MB).", deactivateMissing };
  }
  if (!menu.text.trim()) return { message: "Pilih file menu (CSV) dulu.", deactivateMissing };
  if (menu.text.includes("\uFFFD") || outlet.text.includes("\uFFFD")) {
    return { message: "File bukan UTF-8, hurufnya jadi rusak. Di Excel, simpan sebagai \"CSV UTF-8\" lalu unggah lagi.", deactivateMissing };
  }

  const ctx = await getCatalogContext(slug);
  if (!ctx) return { message: "Brand tidak ditemukan.", deactivateMissing };

  const fileName = (key: string) => {
    const f = formData.get(key);
    return f instanceof File && f.name ? f.name.slice(0, 80) : "unggahan";
  };
  const built = buildSnapshotFromCsv({
    brandSlug: slug,
    outletMode: ctx.outletMode,
    menuCsv: menu.text,
    outletsCsv: outlet.text.trim() ? outlet.text : undefined,
    existing: ctx,
    now: new Date().toISOString(),
    source: `csv:${fileName("menuFile")}`,
  });
  if (!built.ok) return { ...common, issues: built.issues, message: "File belum bisa diimpor. Betulkan yang tertera, lalu unggah lagi." };

  if (intent === "periksa") return { ...common, preview: built.preview, message: undefined };

  const result = await importCatalog(slug, built.snapshot, { ...built.options, deactivateMissing });
  if (!result.ok || !result.stats) {
    return { ...common, preview: built.preview, message: "Impor gagal dan tidak ada data yang berubah. Coba lagi." };
  }
  refreshAll();
  revalidatePath("/", "layout");
  const p = result.stats.products;
  return {
    ok: true,
    deactivateMissing,
    message: `Impor selesai: ${p.upserted} produk diproses (${p.inserted} baru${p.deactivated ? `, ${p.deactivated} dinonaktifkan` : ""}).`,
  };
}
