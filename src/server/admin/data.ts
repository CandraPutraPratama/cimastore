import { z } from "zod";
import {
  AdminBrandDetailSchema,
  AdminImportRunSchema,
  AdminProductDetailSchema,
  CatalogContextSchema,
  type AdminImportRun,
  type AdminProductDetail,
  type CatalogContext,
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
import type { BrandCreate, BrandPatch, ProductToSave, PromoToSave, SettingsPatch } from "@/core/admin/forms";
import type { CatalogSnapshot } from "@/core/catalog/snapshot";
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

export async function updateBrand(slug: string, patch: Partial<BrandPatch> & { isActive?: boolean; logoUrl?: string | null }): Promise<AdminBrand | null> {
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

// ---------------------------------------------------------------------------
// Katalog (Tahap 4B)
// ---------------------------------------------------------------------------

const ActionResultSchema = z.object({ ok: z.boolean(), id: z.string().optional(), slug: z.string().optional(), error: z.string().optional() });
export type ActionResult = z.infer<typeof ActionResultSchema>;

export async function createBrand(brand: BrandCreate): Promise<ActionResult> {
  return ActionResultSchema.parse(
    await rpc("admin_brand_create", {
      p_slug: brand.slug,
      p_name: brand.name,
      p_prefix: brand.prefix,
      p_accent: brand.accent,
      p_outlet_mode: brand.outletMode,
    }),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProduct(slug: string, id: string): Promise<AdminProductDetail | null> {
  if (!UUID.test(id)) return null;
  const data = await rpc("admin_product_get", { p_brand: slug, p_id: id });
  return data ? AdminProductDetailSchema.parse(data) : null;
}

export async function listCategoryNames(slug: string): Promise<string[]> {
  const ctx = await getCatalogContext(slug);
  return ctx ? ctx.categories.map((c) => c.name) : [];
}

export async function saveProduct(slug: string, product: ProductToSave): Promise<ActionResult> {
  return ActionResultSchema.parse(
    await rpc("admin_product_save", {
      p_brand: slug,
      p_product: {
        ...(product.id ? { id: product.id } : {}),
        name: product.name,
        category: product.category,
        description: product.description,
        imageUrl: product.imageUrl,
        ...(product.price !== null ? { price: product.price } : {}),
      },
    }),
  );
}

export async function getCatalogContext(slug: string): Promise<CatalogContext | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const data = await rpc("admin_catalog_context", { p_brand: slug });
  return data ? CatalogContextSchema.parse(data) : null;
}

export async function listImportRuns(slug: string): Promise<AdminImportRun[]> {
  return AdminImportRunSchema.array().parse((await rpc("admin_import_runs", { p_brand: slug, p_limit: 5 })) ?? []);
}

export async function importCatalog(
  slug: string,
  snapshot: CatalogSnapshot,
  options: { syncOutlets: boolean; rewritePriceLists: boolean; replaceOptions: boolean; deactivateMissing: boolean },
): Promise<z.infer<typeof CatalogImportResultSchema>> {
  return CatalogImportResultSchema.parse(await rpc("admin_catalog_import", { p_brand: slug, p_snapshot: snapshot, p_source: snapshot.source, p_options: options }));
}

const CatalogImportResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  stats: z
    .object({
      products: z.object({ upserted: z.number(), inserted: z.number(), deactivated: z.number() }),
      categories: z.object({ upserted: z.number(), inserted: z.number(), deactivated: z.number() }),
      outlets: z.object({ upserted: z.number(), inserted: z.number(), deactivated: z.number() }),
    })
    .passthrough()
    .optional(),
});
