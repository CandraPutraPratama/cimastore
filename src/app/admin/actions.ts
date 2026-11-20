"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBrandForm, parsePromoForm, parseSettingsForm, type FieldErrors, type FormValues } from "@/core/admin/forms";
import { STATUS_LABEL, type OrderStatus } from "@/core/orders/status";
import { loginWithPassword, logout, requireAdmin } from "@/server/admin/auth";
import {
  adminTransition,
  deletePromo,
  getSettings,
  markRefundDone,
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
