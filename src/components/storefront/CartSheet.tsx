"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PricedOrder } from "@/core/pricing/engine";
import { formatRupiah } from "@/core/money/format";

export interface CartRow {
  key: string;
  name: string;
  details: string;
  note?: string;
  quantity: number;
  lineTotal: number;
  problem?: string;
}

interface Props {
  outletName: string;
  rows: CartRow[];
  order: PricedOrder;
  maxItems: number;
  /** null = ada menu bermasalah di keranjang, checkout ditahan. */
  checkoutHref: string | null;
  onQuantity: (key: string, quantity: number) => void;
  onClose: () => void;
}

/** Keranjang berbentuk struk. Angka "Kamu hemat" adalah hal pertama yang dibaca. */
export function CartSheet({ outletName, rows, order, maxItems, checkoutHref, onQuantity, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  const full = order.itemCount >= maxItems;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-keranjang"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl border-x-[2.5px] border-t-[2.5px] border-ink bg-mist focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 id="judul-keranjang" className="text-2xl font-semibold">
            Pesananmu
          </h2>
          <button type="button" onClick={onClose} className="chip px-4 py-2 text-sm">
            Tutup
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="bg-paper shadow-[0_1px_0_var(--color-line)]">
            {order.savings > 0 ? (
              <div className="border-b border-dashed border-line px-5 pt-5 pb-4 text-center">
                <p className="text-sm font-semibold text-hemat">Kamu hemat</p>
                <p className="price font-display text-4xl font-bold text-hemat">{formatRupiah(order.savings)}</p>
                <p className="mt-1 text-xs text-ink-faint">dibanding harga normal di outlet</p>
              </div>
            ) : null}

            <div className="px-5 pt-4 pb-2">
              <p className="text-xs text-ink-faint">Ambil di {outletName}</p>
            </div>

            <ul className="px-5">
              {rows.map((row) => (
                <li key={row.key} className="border-b border-dashed border-line py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{row.name}</p>
                      {row.details ? <p className="text-sm text-ink-soft">{row.details}</p> : null}
                      {row.note ? <p className="text-sm text-ink-soft italic">Catatan: {row.note}</p> : null}
                      {row.problem ? <p className="mt-1 text-sm font-semibold text-danger">{row.problem}</p> : null}
                    </div>
                    <p className="price font-semibold">{row.problem ? "-" : formatRupiah(row.lineTotal)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Kurangi ${row.name}`}
                      onClick={() => onQuantity(row.key, row.quantity - 1)}
                      className="grid size-10 place-items-center rounded-full border-2 border-ink bg-paper text-lg"
                    >
                      −
                    </button>
                    <span className="price w-8 text-center font-semibold">{row.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Tambah ${row.name}`}
                      onClick={() => onQuantity(row.key, row.quantity + 1)}
                      disabled={full || Boolean(row.problem)}
                      className="grid size-10 place-items-center rounded-full border-2 border-ink bg-paper text-lg disabled:opacity-30"
                    >
                      +
                    </button>
                    {row.problem ? (
                      <button type="button" onClick={() => onQuantity(row.key, 0)} className="ml-2 text-sm font-semibold text-danger">
                        Hapus
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mx-5 mt-2 space-y-1.5 border-t border-dashed border-line py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Harga menu ({order.itemCount} item)</dt>
                <dd className="price">{formatRupiah(order.subtotal)}</dd>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between text-hemat">
                  <dt>Diskon promo</dt>
                  <dd className="price">-{formatRupiah(order.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-soft">Biaya jasa order</dt>
                <dd className="price">{order.fee > 0 ? formatRupiah(order.fee) : "Gratis"}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>Total bayar</dt>
                <dd className="price">{formatRupiah(order.total)}</dd>
              </div>
            </dl>
          </div>
          <div aria-hidden className="receipt-edge" />

          {order.hint ? (
            <p className="panel mt-3 bg-spark px-4 py-3 text-sm">
              Tambah <span className="price font-semibold">{formatRupiah(order.hint.amountNeeded)}</span> lagi untuk dapat{" "}
              {order.hint.promoName}.
            </p>
          ) : null}
          {full ? <p className="mt-3 text-sm text-ink-soft">Satu pesanan maksimal {maxItems} item.</p> : null}
        </div>

        <div className="border-t-[2.5px] border-ink bg-paper px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {checkoutHref && order.itemCount > 0 ? (
            <Link
              href={checkoutHref}
              className="btn flex w-full items-center justify-between px-5 py-3"
            >
              <span>Lanjut ke pembayaran</span>
              <span className="price">{formatRupiah(order.total)}</span>
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled
                className="btn flex w-full items-center justify-between px-5 py-3"
              >
                <span>Lanjut ke pembayaran</span>
                <span className="price">{formatRupiah(order.total)}</span>
              </button>
              <p className="mt-2 text-center text-xs text-danger">Hapus atau ubah menu yang bermasalah dulu.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
