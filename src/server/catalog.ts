import { connection } from "next/server";
import {
  HomePayloadSchema,
  MenuPayloadSchema,
  OutletsPayloadSchema,
  type HomePayload,
  type MenuPayload,
  type OutletsPayload,
} from "@/core/catalog/storefront";
import { rpc } from "./db/rpc";

/**
 * Data katalog untuk halaman customer. Selalu diambil saat request (bukan saat build).
 * CATALOG_PREVIEW=true menampilkan brand yang belum diaktifkan (untuk pratinjau pemilik).
 */

function preview(): boolean {
  return process.env.CATALOG_PREVIEW?.trim() === "true";
}

export async function getHome(): Promise<HomePayload> {
  await connection();
  const data = await rpc("catalog_home", { p_include_inactive: preview() });
  return HomePayloadSchema.parse(data);
}

export async function getOutlets(
  brand: string,
  options: { query?: string; lat?: number; lng?: number; limit?: number } = {},
): Promise<OutletsPayload | null> {
  await connection();
  const data = await rpc("catalog_outlets", {
    p_brand: brand,
    p_query: options.query?.slice(0, 60) ?? null,
    p_lat: options.lat ?? null,
    p_lng: options.lng ?? null,
    p_limit: options.limit ?? 30,
    p_include_inactive: preview(),
  });
  return data ? OutletsPayloadSchema.parse(data) : null;
}

export async function getMenu(brand: string, outlet: string): Promise<MenuPayload | null> {
  await connection();
  const data = await rpc("catalog_menu", { p_brand: brand, p_outlet: outlet, p_include_inactive: preview() });
  return data ? MenuPayloadSchema.parse(data) : null;
}
