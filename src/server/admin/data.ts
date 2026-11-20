import { z } from "zod";
import {
  AdminBrandDetailSchema,
  AdminBrandSchema,
  AdminOrderEventSchema,
  AdminOrdersListSchema,
  AdminProductSchema,
  type AdminBrand,
  type AdminBrandDetail,
  type AdminOrderEvent,
  type AdminOrdersList,
  type AdminProduct,
  type OrderFilter,
} from "@/core/admin/types";
import type { BrandPatch, PromoToSave, SettingsPatch } from "@/core/admin/forms";
import { OrderRecordSchema, type OrderRecord } from "@/core/orders/record";
import { isWellFormedOrderId } from "@/core/orders/id";
import { SiteSettingsSchema, type SiteSettings } from "@/core/catalog/storefront";
import { rpc } from "../db/rpc";
import { getOrderForAdmin, transitionOrder, type TransitionResult } from "../orders";
import { syncTelegram } from "../telegram";
import type { OrderStatus } from "@/core/orders/status";

/** Membaca dan mengubah data lewat fungsi database admin. Hanya dipanggil dari halaman/aksi yang sudah requireAdmin(). */

export async function listOrders(filter: OrderFilter, query: string | undefined): Promise<AdminOrdersList> {
  const data = await rpc("admin_orders_list", { p_filter: filter, p_query: query?.slice(0, 60) || null, p_limit: 80 });
  return AdminOrdersListSchema.parse(data);
}

export async function getOrderDetail(id: string): Promise<{ order: OrderRecord; events: AdminOrderEvent[] } | null> {
  if (!isWellFormedOrderId(id)) return null;
  const order = await getOrderForAdmin(id);
  if (!order) return null;
  const events = AdminOrderEventSchema.array().parse((await rpc("admin_order_events", { p_id: id })) ?? []);
  return { order, events };
}

/** Admin mengubah status. Pesan Telegram ikut diperbarui supaya dua tempat kerja admin selalu sama. */
export async function adminTransition(id: string, to: OrderStatus, cancellationReason?: string): Promise<TransitionResult | null> {
  const result = await transitionOrder({
    id,
    to,
    actor: "admin",
    actorLabel: "admin",
    note: "Lewat panel admin",
    ...(to === "dibatalkan" ? { cancellationReason: cancellationReason?.trim().slice(0, 120) || "Dibatalkan admin" } : {}),
  });
  if (result?.kind === "changed") await syncTelegram(result.order, "Diubah lewat panel admin");
  return result;
}

export async function markRefundDone(id: string): Promise<OrderRecord | null> {
  if (!isWellFormedOrderId(id)) return null;
  const data = await rpc("admin_order_refund_done", { p_id: id, p_actor: "admin" });
  if (!data) return null;
  const order = OrderRecordSchema.parse(data);
  await syncTelegram(order, "Refund sudah dikirim");
  return order;
}

export async function listBrands(): Promise<AdminBrand[]> {
  return AdminBrandSchema.array().parse((await rpc("admin_brands_list", {})) ?? []);
}

export async function getBrand(slug: string): Promise<AdminBrandDetail | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const data = await rpc("admin_brand_get", { p_slug: slug });
  return data ? AdminBrandDetailSchema.parse(data) : null;
}

export async function updateBrand(slug: string, patch: Partial<BrandPatch> & { isActive?: boolean }): Promise<AdminBrand | null> {
  const data = await rpc("admin_brand_update", { p_slug: slug, p_patch: patch });
  return data ? AdminBrandSchema.parse(data) : null;
}

const SaveResultSchema = z.object({ ok: z.boolean(), id: z.string().optional(), error: z.string().optional() });

export async function savePromo(slug: string, promo: PromoToSave): Promise<z.infer<typeof SaveResultSchema>> {
  return SaveResultSchema.parse(await rpc("admin_promo_save", { p_brand: slug, p_promo: promo }));
}

export async function setPromoActive(slug: string, id: string, active: boolean): Promise<boolean> {
  return (await rpc<boolean>("admin_promo_set_active", { p_brand: slug, p_id: id, p_active: active })) === true;
}

export async function deletePromo(slug: string, id: string): Promise<boolean> {
  return (await rpc<boolean>("admin_promo_delete", { p_brand: slug, p_id: id })) === true;
}

export async function listProducts(slug: string, query?: string): Promise<AdminProduct[]> {
  return AdminProductSchema.array().parse((await rpc("admin_products_list", { p_brand: slug, p_query: query?.slice(0, 60) || null, p_limit: 400 })) ?? []);
}

export async function setProductVisible(slug: string, id: string, visible: boolean): Promise<boolean> {
  return (await rpc<boolean>("admin_product_set_visible", { p_brand: slug, p_id: id, p_visible: visible })) === true;
}

export async function getSettings(): Promise<SiteSettings> {
  return SiteSettingsSchema.parse((await rpc("site_settings_get", {})) ?? {});
}

export async function updateSettings(patch: SettingsPatch): Promise<SiteSettings> {
  return SiteSettingsSchema.parse(await rpc("admin_settings_update", { p_patch: patch }));
}
