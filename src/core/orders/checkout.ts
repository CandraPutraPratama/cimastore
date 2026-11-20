import { z } from "zod";
import { MAX_QUANTITY_PER_LINE } from "../catalog/selection";

/** Data checkout yang dikirim browser. Harga tidak dikirim: server menghitung ulang semuanya. */

const shortId = z.string().min(1).max(64);

export const CheckoutRequestSchema = z.object({
  brand: shortId,
  outlet: shortId,
  customer: z.object({
    name: z.string().max(200),
    whatsapp: z.string().max(40),
  }),
  pickup: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("now") }),
    z.object({ mode: z.literal("scheduled"), time: z.string().regex(/^\d{2}:\d{2}$/) }),
  ]),
  items: z
    .array(
      z.object({
        productId: shortId,
        optionIds: z.array(shortId).max(40),
        quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
        note: z.string().max(400).optional(),
      }),
    )
    .min(1)
    .max(40),
  /** Total yang dilihat customer. Bila beda dengan hitungan server, pesanan ditolak agar customer melihat harga baru. */
  expectedTotal: z.number().int().min(0),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

// Karakter kontrol & pemisah baris dibuang supaya isi pesan WA/Telegram tidak bisa dipalsukan.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

export function cleanSingleLine(text: string, maxLength: number): string {
  return text.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

export const MAX_NAME_LENGTH = 60;
export const MAX_NOTE_LENGTH = 120;

export function normalizeCustomerName(input: string): string | null {
  const name = cleanSingleLine(input, MAX_NAME_LENGTH);
  return /\p{L}/u.test(name) ? name : null;
}

/** 0812..., 812..., +62 812..., 62812... menjadi 62812...; selain nomor HP Indonesia ditolak. */
export function normalizeWhatsapp(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return /^628[0-9]{7,12}$/.test(digits) ? digits : null;
}

export function normalizeNote(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const note = cleanSingleLine(input, MAX_NOTE_LENGTH);
  return note || undefined;
}
