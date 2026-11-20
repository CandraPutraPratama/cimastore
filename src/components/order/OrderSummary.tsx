import { formatRupiah } from "@/core/money/format";

export interface SummaryLine {
  key: string;
  name: string;
  details: string;
  note?: string;
  quantity: number;
  lineTotal: number;
}

export interface SummaryTotals {
  itemCount: number;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  savings: number;
}

/** Rincian pesanan berbentuk struk (tanpa tombol ubah jumlah). */
export function OrderSummary({ lines, totals, caption }: { lines: SummaryLine[]; totals: SummaryTotals; caption?: string }) {
  return (
    <div>
      <div className="bg-paper shadow-[0_1px_0_var(--color-line)]">
        {caption ? <p className="px-5 pt-4 text-xs text-ink-faint">{caption}</p> : null}
        <ul className="px-5">
          {lines.map((line) => (
            <li key={line.key} className="flex items-start justify-between gap-3 border-b border-dashed border-line py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="font-semibold">
                  <span className="price">{line.quantity}x</span> {line.name}
                </p>
                {line.details ? <p className="text-sm text-ink-soft">{line.details}</p> : null}
                {line.note ? <p className="text-sm text-ink-soft italic">Catatan: {line.note}</p> : null}
              </div>
              <p className="price font-semibold">{formatRupiah(line.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mx-5 space-y-1.5 border-t border-dashed border-line py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Harga menu ({totals.itemCount} item)</dt>
            <dd className="price">{formatRupiah(totals.subtotal)}</dd>
          </div>
          {totals.discount > 0 ? (
            <div className="flex justify-between text-hemat">
              <dt>Diskon promo</dt>
              <dd className="price">-{formatRupiah(totals.discount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-soft">Biaya jasa order</dt>
            <dd className="price">{totals.fee > 0 ? formatRupiah(totals.fee) : "Gratis"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <dt>Total bayar</dt>
            <dd className="price">{formatRupiah(totals.total)}</dd>
          </div>
          {totals.savings > 0 ? (
            <p className="pt-1 text-right text-sm font-semibold text-hemat">Hemat {formatRupiah(totals.savings)} dari harga normal</p>
          ) : null}
        </dl>
      </div>
      <div aria-hidden className="receipt-edge" />
    </div>
  );
}
