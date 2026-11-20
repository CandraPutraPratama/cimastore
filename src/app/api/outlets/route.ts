import type { NextRequest } from "next/server";
import { getOutlets } from "@/server/catalog";

/** Pencarian outlet untuk halaman pilih outlet: GET /api/outlets?brand=fore&q=senopati&lat=..&lng=.. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const brand = params.get("brand") ?? "";
  if (!/^[a-z0-9-]{1,40}$/.test(brand)) return Response.json({ error: "Brand tidak valid" }, { status: 400 });

  const num = (name: string, min: number, max: number) => {
    const v = Number(params.get(name));
    return params.has(name) && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
  };
  const lat = num("lat", -90, 90);
  const lng = num("lng", -180, 180);

  const data = await getOutlets(brand, {
    query: params.get("q") ?? undefined,
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
  });
  if (!data) return Response.json({ error: "Brand tidak ditemukan" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
}
