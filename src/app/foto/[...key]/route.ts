import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PHOTO_KEY_PATTERN } from "@/core/catalog/photos";

/**
 * Menayangkan foto produk dari R2 (binding FOTO). Kunci memuat hash isi file, jadi aman
 * di-cache selamanya: foto yang diganti mendapat alamat baru.
 */
export async function GET(request: Request, context: RouteContext<"/foto/[...key]">): Promise<Response> {
  const { key: parts } = await context.params;
  const key = parts.join("/");
  if (!PHOTO_KEY_PATTERN.test(key)) return new Response("Tidak ditemukan", { status: 404 });

  const bucket = getCloudflareContext().env.FOTO;
  if (!bucket) return new Response("Tidak ditemukan", { status: 404 });

  const object = await bucket.get(key);
  if (!object) return new Response("Tidak ditemukan", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

  if (request.headers.get("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}
