/**
 * Semua nominal uang di Jasdor disimpan sebagai bilangan bulat rupiah (tanpa desimal).
 */

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

/** Format rupiah untuk tampilan, contoh: 22500 -> "Rp22.500", -5000 -> "-Rp5.000". */
export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Nominal tidak valid: ${amount}`);
  }
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}Rp${rupiahFormatter.format(Math.abs(rounded))}`;
}
