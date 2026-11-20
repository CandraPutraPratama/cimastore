import { z } from "zod";
import { FeeRulesSchema, PromoSchema, SplitModeSchema, type BrandPricingConfig } from "../pricing/rules";
import type { ResolvedProduct } from "./types";

/**
 * Bentuk data yang dikirim fungsi baca katalog (catalog_home, catalog_outlets, catalog_menu)
 * ke website. Field kosong dibuang di database, jadi hampir semua field opsional.
 */

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const ThemeSchema = z.object({ accent: z.string().optional() }).catchall(z.unknown()).default({});

export const SiteSettingsSchema = z.object({
  openDays: z.array(z.number().int().min(0).max(6)).default([5, 6, 0]),
  tentativeDays: z.array(z.number().int().min(0).max(6)).default([]),
  openTime: hhmm.default("08:00"),
  closeTime: hhmm.default("23:20"),
  timeZone: z.string().default("Asia/Jakarta"),
  whatsappNumber: z.string().default(""),
  announcement: z.string().nullish(),
  emergencyClosed: z.boolean().default(false),
});
export type SiteSettings = z.output<typeof SiteSettingsSchema>;

const BrandBaseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  theme: ThemeSchema,
  outletMode: z.enum(["catalog", "customer_input"]),
  isActive: z.boolean(),
});

export const HomePayloadSchema = z.object({
  settings: SiteSettingsSchema.default(SiteSettingsSchema.parse({})),
  brands: z.array(
    BrandBaseSchema.extend({
      logoUrl: z.string().nullish(),
      outletCount: z.number().int(),
      promoNames: z.array(z.string()).default([]),
    }),
  ),
});
export type HomePayload = z.output<typeof HomePayloadSchema>;
export type BrandSummary = HomePayload["brands"][number];

export const OutletSummarySchema = z.object({
  code: z.string(),
  name: z.string(),
  city: z.string().optional(),
  address: z.string().optional(),
  openTime: hhmm.optional(),
  closeTime: hhmm.optional(),
  distanceKm: z.number().optional(),
});
export type OutletSummary = z.output<typeof OutletSummarySchema>;

export const OutletsPayloadSchema = z.object({
  brand: BrandBaseSchema,
  total: z.number().int(),
  outlets: z.array(OutletSummarySchema),
});
export type OutletsPayload = z.output<typeof OutletsPayloadSchema>;

const MenuOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceDelta: z.number().int(),
  compareAtDelta: z.number().int().optional(),
  isDefault: z.boolean().default(false),
  requiresAnyOf: z.array(z.string()).optional(),
});

const MenuOptionGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  selection: z.enum(["single", "multiple"]),
  min: z.number().int(),
  max: z.number().int().nullish().transform((v) => v ?? null),
  options: z.array(MenuOptionSchema),
});

export const MenuProductSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  basePrice: z.number().int(),
  compareAtPrice: z.number().int().optional(),
  status: z.enum(["available", "sold_out"]),
  optionGroupIds: z.array(z.string()).default([]),
  optionDeltas: z.record(z.string(), z.number().int()).default({}),
});
export type MenuProduct = z.output<typeof MenuProductSchema>;

export const MenuPayloadSchema = z.object({
  brand: BrandBaseSchema.extend({
    splitMode: SplitModeSchema,
    feeRules: FeeRulesSchema,
    maxItemsPerOrder: z.number().int().positive(),
  }),
  promos: z.array(PromoSchema).default([]),
  outlet: OutletSummarySchema.omit({ distanceKm: true }),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  optionGroups: z.record(z.string(), MenuOptionGroupSchema).default({}),
  products: z.array(MenuProductSchema),
});
export type MenuPayload = z.output<typeof MenuPayloadSchema>;

/** Produk menu dalam bentuk yang dipakai validasi pilihan & mesin harga. */
export function resolveMenuProduct(menu: MenuPayload, productId: string): ResolvedProduct | null {
  const product = menu.products.find((p) => p.id === productId);
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    basePrice: product.basePrice,
    ...(product.compareAtPrice !== undefined ? { compareAtPrice: product.compareAtPrice } : {}),
    status: product.status,
    optionGroups: product.optionGroupIds
      .map((gid) => menu.optionGroups[gid])
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map((g) => ({
        id: g.id,
        name: g.name,
        selection: g.selection,
        min: g.min,
        max: g.max,
        options: g.options.map((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: product.optionDeltas[o.id] ?? o.priceDelta,
          ...(o.compareAtDelta !== undefined ? { compareAtDelta: o.compareAtDelta } : {}),
          isDefault: o.isDefault,
          ...(o.requiresAnyOf ? { requiresAnyOf: o.requiresAnyOf } : {}),
        })),
      })),
  };
}

export function menuPricingConfig(menu: MenuPayload): BrandPricingConfig {
  return { promos: menu.promos, fee: menu.brand.feeRules, splitMode: menu.brand.splitMode };
}

/** Harga terendah yang mungkin untuk ditampilkan di daftar menu ("mulai dari"). */
export function startingPrice(menu: MenuPayload, product: MenuProduct): number {
  let price = product.basePrice;
  for (const gid of product.optionGroupIds) {
    const group = menu.optionGroups[gid];
    if (!group || group.min === 0) continue;
    const deltas = group.options
      .filter((o) => !o.requiresAnyOf)
      .map((o) => product.optionDeltas[o.id] ?? o.priceDelta);
    if (deltas.length > 0) price += Math.min(...deltas) * group.min;
  }
  return price;
}
