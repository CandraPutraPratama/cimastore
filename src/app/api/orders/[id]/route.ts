import { toPublicOrder } from "@/core/orders/record";
import { getOrderForCustomer } from "@/server/orders";
import { errorResponse, json } from "@/server/http";

/** Status pesanan untuk halaman bayar (dipanggil berkala). Token di header x-order-token. */
export async function GET(request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const order = await getOrderForCustomer(id, request.headers.get("x-order-token"));
    if (!order) return json({ error: "Pesanan tidak ditemukan.", code: "NOT_FOUND" }, 404);
    return json({ order: toPublicOrder(order) });
  } catch (error) {
    return errorResponse(error, "orders.get");
  }
}
