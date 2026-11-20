import type { Metadata } from "next";
import Link from "next/link";
import { FILTER_LABEL, ORDER_FILTERS, parseOrderFilter } from "@/core/admin/types";
import { formatRupiah } from "@/core/money/format";
import { pickupLabel } from "@/core/orders/pickup";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { displayWa } from "@/components/admin/format";
import { card, input, btn } from "@/components/admin/styles";
import { PageTitle, StatusBadge } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getSettings, listOrders } from "@/server/admin/data";

export const metadata: Metadata = { title: "Pesanan" };

export default async function OrdersPage({ searchParams }: PageProps<"/admin/pesanan">) {
  await requireAdmin();
  const params = await searchParams;
  const filter = parseOrderFilter(typeof params.filter === "string" ? params.filter : undefined);
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const [{ orders, counts }, settings] = await Promise.all([listOrders(filter, query), getSettings()]);

  const href = (f: string) => `/admin/pesanan?filter=${f}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <>
      {filter === "aktif" || filter === "bayar" ? <AutoRefresh /> : null}
      <PageTitle title="Pesanan" />

      <nav aria-label="Saring pesanan" className="mb-4 flex flex-wrap gap-2">
        {ORDER_FILTERS.map((f) => {
          const count = f === "semua" ? null : counts[f];
          const active = f === filter;
          return (
            <Link
              key={f}
              href={href(f)}
              aria-current={active ? "page" : undefined}
              className={`chip min-h-11 gap-2 px-4 text-sm ${active ? "bg-marigold shadow-[2px_2px_0_var(--color-ink)]" : ""}`}
            >
              {FILTER_LABEL[f]}
              {count !== null && count > 0 ? <span className={`rounded-full px-2 text-xs ${active ? "bg-paper" : f === "refund" ? "bg-danger/10 text-danger" : "bg-mist"}`}>{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      <form action="/admin/pesanan" className="mb-4 flex gap-2" role="search">
        <input type="hidden" name="filter" value={filter} />
        <input type="search" name="q" defaultValue={query} placeholder="Cari ID, nama, atau nomor WhatsApp" aria-label="Cari pesanan" className={input} />
        <button type="submit" className={btn}>
          Cari
        </button>
      </form>

      {orders.length === 0 ? (
        <p className={`${card} text-ink-soft`}>{query ? "Tidak ada pesanan yang cocok." : "Belum ada pesanan di daftar ini."}</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/pesanan/${o.id}`} className={`${card} flex gap-3 transition-colors hover:bg-mist`}>
                <span aria-hidden className="w-1.5 shrink-0 rounded-full" style={{ background: o.accent ?? "var(--color-ink)" }} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-sm font-bold">{o.id}</span>
                    <StatusBadge status={o.status} />
                    {o.needsRefund ? <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Perlu refund</span> : null}
                  </span>
                  <span className="mt-1 block font-semibold">
                    {o.customerName} <span className="font-normal text-ink-soft">· {displayWa(o.customerWa)}</span>
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {o.brandName} · {o.outletLabel}
                  </span>
                  <span className="block text-sm text-ink-soft">Ambil {pickupLabel(o.pickupMode, new Date(o.pickupAt), settings.timeZone)}</span>
                </span>
                <span className="price shrink-0 text-right">
                  <span className="block font-bold">{formatRupiah(o.total)}</span>
                  <span className="block text-sm text-ink-soft">{o.itemCount} item</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {orders.length >= 80 ? <p className="mt-3 text-sm text-ink-soft">Menampilkan 80 pesanan terbaru. Persempit dengan pencarian atau filter.</p> : null}
    </>
  );
}
