import { env, safeEqual } from "@/server/config";
import { errorResponse, json } from "@/server/http";
import { expireDueOrders } from "@/server/orders";

/**
 * Merapikan pesanan belum dibayar yang lewat batas waktu. Tidak wajib untuk kebenaran
 * (pesanan juga dicek saat dibuka), hanya agar daftar pesanan bersih.
 * Dipanggil penjadwal dengan header Authorization: Bearer <CRON_SECRET>.
 */
async function handle(request: Request) {
  const secret = env("CRON_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(secret, provided)) return json({ error: "Unauthorized" }, 401);
  try {
    return json({ expired: await expireDueOrders() });
  } catch (error) {
    return errorResponse(error, "cron.expire");
  }
}

export const GET = handle;
export const POST = handle;
