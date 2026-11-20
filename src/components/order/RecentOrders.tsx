"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { formatRupiah } from "@/core/money/format";
import { loadOrders, type SavedOrder } from "./localOrders";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY: SavedOrder[] = [];
let snapshot: SavedOrder[] | undefined;

function recent(): SavedOrder[] {
  snapshot ??= loadOrders().filter((o) => Date.now() - new Date(o.createdAt).getTime() < DAY_MS).slice(0, 3);
  return snapshot;
}

const noSubscribe = () => () => {};

/** Pesanan hari ini dari browser ini, supaya halaman bayar/status bisa dibuka lagi. */
export function RecentOrders() {
  const orders = useSyncExternalStore(noSubscribe, recent, () => EMPTY);
  if (orders.length === 0) return null;
  return (
    <section className="px-5 pt-5" aria-labelledby="judul-pesanan-terakhir">
      <h2 id="judul-pesanan-terakhir" className="text-xl font-semibold">
        Pesananmu hari ini
      </h2>
      <ul className="mt-3 space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={o.path} className="panel-flat flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {o.brandName} di {o.outletName}
                </span>
                <span className="price block text-sm text-ink-soft">{o.id}</span>
              </span>
              <span className="price font-semibold">{formatRupiah(o.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
