/**
 * QRIS (standar EMVCo Merchant-Presented QR).
 *
 * Pemilik punya satu QRIS statis (customer mengetik nominal sendiri). Dari payload yang
 * sama kita bisa membuat QRIS dengan nominal terisi: tag 01 diubah ke "12" (dinamis),
 * tag 54 (nominal) disisipkan, lalu CRC (tag 63) dihitung ulang. Merchant dan akun
 * penerima tidak berubah, jadi uang tetap masuk ke rekening yang sama.
 */

export interface TlvField {
  tag: string;
  value: string;
}

export class QrisError extends Error {}

export function parseTlv(payload: string): TlvField[] {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const lengthText = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      throw new QrisError(`Format QRIS rusak di posisi ${i}.`);
    }
    const length = Number(lengthText);
    const value = payload.slice(i + 4, i + 4 + length);
    if (value.length !== length) throw new QrisError(`Panjang tag ${tag} tidak sesuai.`);
    fields.push({ tag, value });
    i += 4 + length;
  }
  return fields;
}

function encodeField({ tag, value }: TlvField): string {
  if (value.length > 99) throw new QrisError(`Isi tag ${tag} terlalu panjang.`);
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, awal 0xFFFF), 4 digit hex huruf besar. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function withCrc(body: string): string {
  const head = `${body}6304`;
  return `${head}${crc16(head)}`;
}

export interface QrisInfo {
  merchantName: string;
  city: string;
  /** NMID (ID nasional merchant), dari tag 51 sub-tag 02. */
  nmid?: string;
  isDynamic: boolean;
  amount?: number;
}

/** Memeriksa CRC dan field wajib. Melempar QrisError bila payload tidak bisa dipakai. */
export function inspectQris(payload: string): QrisInfo {
  const clean = payload.trim();
  if (!clean.startsWith("000201")) throw new QrisError("QRIS harus diawali 000201.");
  const fields = parseTlv(clean);
  const last = fields[fields.length - 1];
  if (last?.tag !== "63" || last.value.length !== 4) throw new QrisError("QRIS tidak punya CRC di akhir.");
  if (crc16(clean.slice(0, -4)) !== last.value.toUpperCase()) throw new QrisError("CRC QRIS tidak cocok.");

  const get = (tag: string) => fields.find((f) => f.tag === tag)?.value;
  const merchantName = get("59");
  const city = get("60");
  if (get("53") !== "360") throw new QrisError("Mata uang QRIS bukan Rupiah.");
  if (get("58") !== "ID") throw new QrisError("Negara QRIS bukan Indonesia.");
  if (!merchantName || !city) throw new QrisError("Nama atau kota merchant kosong.");

  const national = get("51");
  const nmid = national ? parseTlv(national).find((f) => f.tag === "02")?.value : undefined;
  const amountText = get("54");
  return {
    merchantName,
    city,
    ...(nmid ? { nmid } : {}),
    isDynamic: get("01") === "12",
    ...(amountText ? { amount: Number(amountText) } : {}),
  };
}

export const MAX_QRIS_AMOUNT = 10_000_000;

/** QRIS dengan nominal terisi dari payload QRIS statis (atau dinamis) pemilik. */
export function qrisWithAmount(payload: string, amount: number): string {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_QRIS_AMOUNT) {
    throw new QrisError("Nominal QRIS harus bilangan bulat Rp1 sampai Rp10.000.000.");
  }
  inspectQris(payload);
  const fields = parseTlv(payload.trim()).filter((f) => f.tag !== "63" && f.tag !== "54");
  const result: TlvField[] = [];
  let inserted = false;
  for (const field of fields) {
    if (!inserted && Number(field.tag) > 54) {
      result.push({ tag: "54", value: String(amount) });
      inserted = true;
    }
    result.push(field.tag === "01" ? { tag: "01", value: "12" } : field);
  }
  if (!inserted) result.push({ tag: "54", value: String(amount) });
  return withCrc(result.map(encodeField).join(""));
}
