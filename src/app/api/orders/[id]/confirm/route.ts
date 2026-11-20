import { toPublicOrder } from "@/core/orders/record";
import { confirmPayment } from "@/server/orders";
import { errorResponse, json } from "@/server/http";

/** Customer menekan "Saya sudah bayar": POST /api/orders/<id>/confirm, token di header x-order-token. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/confirm">) {
  try {
    const { id } = await ctx.params;
    const order = await confirmPayment(id, request.headers.get("x-order-token"));
    return json({ order: toPublicOrder(order) });
  } catch (error) {
    return errorResponse(error, "orders.confirm");
  }
}
