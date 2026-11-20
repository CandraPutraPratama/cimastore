import { OrderError } from "./orders";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

/** Kesalahan yang dikenal dikirim apa adanya; selain itu pesan umum (detail hanya di log server). */
export function errorResponse(error: unknown, context: string): Response {
  if (error instanceof OrderError) {
    return json({ error: error.message, code: error.code, ...(error.details !== undefined ? { details: error.details } : {}) }, error.status);
  }
  console.error(`[${context}]`, error);
  return json({ error: "Terjadi gangguan. Coba lagi sebentar lagi.", code: "SERVER_ERROR" }, 500);
}

/** Membaca body JSON dengan batas ukuran supaya request raksasa langsung ditolak. */
export async function readJson(request: Request, maxBytes = 32 * 1024): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new OrderError(413, "TOO_LARGE", "Data terlalu besar.");
  try {
    return JSON.parse(text);
  } catch {
    throw new OrderError(400, "INVALID_JSON", "Format data tidak valid.");
  }
}
