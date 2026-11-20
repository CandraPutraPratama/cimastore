import { z } from "zod";
import { FeeRulesSchema, SplitModeSchema } from "../pricing/rules";
import { ORDER_STATUSES } from "../orders/status";

/** Bentuk data yang dikembalikan fungsi database admin (supabase/migrations/..._admin.sql). */

export const ORDER_FILTERS = ["aktif", "bayar", "selesai", "batal", "refund", "semua"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export const FILTER_LABEL: Record<OrderFilter, string> = {
  aktif: "Perlu diproses",
  bayar: "Belum dibayar",
  selesai: "Selesai",
  batal: "Batal",
  refund: "Perlu refund",
  semua: "Semua",
};

export function parseOrderFilter(value: string | undefined): OrderFilter {
  return (ORDER_FILTERS as readonly string[]).includes(value ?? "") ? (value as OrderFilter) : "aktif";
}

export const AdminOrderSummarySchema = z.object({
  id: z.string(),
  status: z.enum(ORDER_STATUSES),
  brandSlug: z.string(),
  brandName: z.string(),
  accent: z.string().nullish(),
  customerName: z.string(),
  customerWa: z.string(),
  outletLabel: z.string(),
  itemCount: z.number().int(),
  total: z.number().int(),
  pickupMode: z.enum(["now", "scheduled"]),
  pickupAt: z.string(),
  createdAt: z.string(),
  needsRefund: z.boolean(),
});
export type AdminOrderSummary = z.infer<typeof AdminOrderSummarySchema>;

export const AdminOrdersListSchema = z.object({
  orders: z.array(AdminOrderSummarySchema),
  counts: z.object({
    aktif: z.number().int(),
    bayar: z.number().int(),
    selesai: z.number().int(),
    batal: z.number().int(),
    refund: z.number().int(),
  }),
});
export type AdminOrdersList = z.infer<typeof AdminOrdersListSchema>;

export const AdminOrderEventSchema = z.object({
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  actor: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminOrderEvent = z.infer<typeof AdminOrderEventSchema>;

export const AdminBrandSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullish(),
  theme: z.object({ accent: z.string().optional() }).catchall(z.unknown()),
  orderPrefix: z.string(),
  feeRules: FeeRulesSchema,
  outletMode: z.enum(["catalog", "customer_input"]),
  splitMode: SplitModeSchema,
  maxItemsPerOrder: z.number().int(),
  importer: z.enum(["manual", "api"]),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  productCount: z.number().int(),
  outletCount: z.number().int(),
  promoCount: z.number().int(),
});
export type AdminBrand = z.infer<typeof AdminBrandSchema>;

export const AdminPromoSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(["transaction", "item"]),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int(),
  scope: z.enum(["all_items", "cheapest_item"]),
  appliesTo: z.enum(["base_price", "subtotal"]),
  maxDiscount: z.number().int().nullable(),
  minSubtotal: z.number().int().nullable(),
  minQty: z.number().int().nullable(),
  maxQty: z.number().int().nullable(),
  maxUsesPerOrder: z.number().int().nullable(),
  maxUnits: z.number().int().nullable(),
  productIds: z.array(z.string()).nullish().transform((v) => v ?? []),
  productNames: z.array(z.string()).nullish().transform((v) => v ?? []),
  active: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
});
export type AdminPromo = z.infer<typeof AdminPromoSchema>;

export const AdminBrandDetailSchema = AdminBrandSchema.extend({ promos: z.array(AdminPromoSchema) });
export type AdminBrandDetail = z.infer<typeof AdminBrandDetailSchema>;

export const AdminProductSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  name: z.string(),
  category: z.string(),
  isVisible: z.boolean(),
  isActive: z.boolean(),
  minPrice: z.number().int().nullable(),
  maxPrice: z.number().int().nullable(),
});
export type AdminProduct = z.infer<typeof AdminProductSchema>;

/** Ringkasan aturan promo dalam kalimat Indonesia untuk daftar di panel admin. */
export function describePromo(p: Pick<AdminPromo, "level" | "type" | "value" | "scope" | "maxDiscount" | "minSubtotal" | "minQty" | "maxQty" | "maxUsesPerOrder" | "maxUnits">): string {
  const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
  const parts: string[] = [];
  parts.push(p.type === "percent" ? `${p.value}%` : rp(p.value));
  if (p.scope === "cheapest_item") parts.push("untuk item termurah");
  else if (p.level === "item") parts.push("per porsi");
  if (p.maxDiscount) parts.push(`maks ${rp(p.maxDiscount)}`);
  if (p.minSubtotal) parts.push(`min belanja ${rp(p.minSubtotal)}`);
  if (p.minQty && p.maxQty) parts.push(p.minQty === p.maxQty ? `tepat ${p.minQty} item` : `${p.minQty}-${p.maxQty} item`);
  else if (p.minQty) parts.push(`min ${p.minQty} item`);
  else if (p.maxQty) parts.push(`maks ${p.maxQty} item`);
  if (p.maxUnits) parts.push(`maks ${p.maxUnits} porsi per pesanan`);
  if (p.maxUsesPerOrder) parts.push(`maks ${p.maxUsesPerOrder}x per pesanan`);
  return parts.join(", ");
}

export const AdminProductDetailSchema = z.object({
  product: z.object({
    id: z.string(),
    externalId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    category: z.string(),
    categoryExternalId: z.string(),
    isVisible: z.boolean(),
    isActive: z.boolean(),
  }),
  categories: z.array(z.object({ externalId: z.string(), name: z.string() })),
  priceListCount: z.number().int(),
  minPrice: z.number().int().nullable(),
  maxPrice: z.number().int().nullable(),
});
export type AdminProductDetail = z.infer<typeof AdminProductDetailSchema>;

export const AdminImportRunSchema = z.object({
  source: z.string(),
  status: z.string(),
  startedAt: z.string(),
  stats: z.object({ products: z.object({ inserted: z.number(), upserted: z.number(), deactivated: z.number() }).partial() }).partial().passthrough(),
});
export type AdminImportRun = z.infer<typeof AdminImportRunSchema>;

export const CatalogContextSchema = z.object({
  outletMode: z.enum(["catalog", "customer_input"]),
  categories: z.array(z.object({ externalId: z.string(), name: z.string() })),
  products: z.array(z.object({ externalId: z.string(), name: z.string(), category: z.string(), isActive: z.boolean() })),
  outletCodes: z.array(z.string()),
  priceListCodes: z.array(z.string()),
});
export type CatalogContext = z.infer<typeof CatalogContextSchema>;
