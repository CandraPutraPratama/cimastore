import { createOrder } from "@/server/orders";
import { errorResponse, json, readJson } from "@/server/http";

/** Membuat pesanan: POST /api/orders. Balasan berisi link halaman bayar (dengan token rahasia). */
export async function POST(request: Request) {
  try {
    const created = await createOrder(await readJson(request));
    return json(created, 201);
  } catch (error) {
    return errorResponse(error, "orders.create");
  }
}
