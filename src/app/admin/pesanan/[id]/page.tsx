import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRupiah } from "@/core/money/format";
import { pickupLabel } from "@/core/orders/pickup";
import type { OrderRecord } from "@/core/orders/record";
import { STATUS_LABEL, nextAdminActions, type OrderStatus } from "@/core/orders/status";
import { changeOrderStatusAction, refundDoneAction } from "../../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { displayWa, formatDateTime } from "@/components/admin/format";
import { btn, btnDanger, btnPrimary, card, input } from "@/components/admin/styles";
import { Flash, StatusBadge } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getOrderDetail, getSettings } from "@/server/admin/data";

export const metadata: Metadata = { title: "Detail pesanan" };

const ACTION_LABEL: Record<string, string> = {
  antrian: "Terima (masuk antrian)",
  diproses: "Sedang dibelikan",
  selesai: "Tandai selesai",
  dibatalkan: "Batalkan pesanan",
};

function lineTitle(line: OrderRecord["items"][number], quantity = line.quantity): string {
  const options = line.options.map((o) => o.name).join(", ");
  return `${quantity}x ${line.name}${options ? ` (${options})` : ""}`;
}

export default async function OrderDetailPage({ params, searchParams }: PageProps<"/admin/pesanan/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const { order, events } = detail;
  const { timeZone } = await getSettings();
  const transactions = order.pricing.transactions;
  const actions = nextAdminActions(order.status);
  const live = order.status === "menunggu_pembayaran" || order.status === "antrian" || order.status === "diproses" || order.status === "menunggu_konfirmasi";

  return (
    <>
      {live ? <AutoRefresh seconds={20} /> : null}
      <p className="mb-3">
        <Link href="/admin/pesanan" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; Semua pesanan
        </Link>
      </p>
      <Flash code={typeof query.info === "string" ? query.info : undefined} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className={card} aria-labelledby="ringkasan">
            <div className="flex flex-wrap items-center gap-3">
              <h1 id="ringkasan" className="font-mono text-xl font-bold">
                {order.id}
              </h1>
              <StatusBadge status={order.status} />
              {order.needsRefund ? <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Perlu refund</span> : null}
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-soft">Brand</dt>
                <dd className="font-semibold">{order.brand.name}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Outlet</dt>
                <dd className="font-semibold">{order.outletLabel}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Pemesan</dt>
                <dd className="font-semibold">
                  {order.customerName} ·{" "}
                  <a href={`https://wa.me/${order.customerWa}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    {displayWa(order.customerWa)}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">Ambil</dt>
                <dd className="font-semibold">{pickupLabel(order.pickupMode, new Date(order.pickupAt), timeZone)}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Dibuat</dt>
                <dd>{formatDateTime(order.createdAt, timeZone)}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">{order.paidAt ? "Dibayar" : "Batas bayar"}</dt>
                <dd>{formatDateTime(order.paidAt ?? order.expiresAt, timeZone)}</dd>
              </div>
            </dl>
            {order.cancellationReason ? <p className="mt-3 text-sm text-danger">Alasan batal: {order.cancellationReason}</p> : null}
          </section>

          <section className={card} aria-labelledby="cara-beli">
            <h2 id="cara-beli" className="text-lg font-bold">
              {transactions.length > 1 ? `Cara beli: ${transactions.length} transaksi terpisah` : "Cara beli"}
            </h2>
            <ol className="mt-3 space-y-4">
              {transactions.map((tx, i) => (
                <li key={i} className="rounded-xl bg-mist p-3">
                  <p className="text-sm font-semibold">
                    {transactions.length > 1 ? `Transaksi ${i + 1}: ` : ""}
                    {tx.promo ? `pakai voucher ${tx.promo.name}` : "tanpa voucher"}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {tx.units.map((unit) => {
                      const line = order.items[unit.lineIndex];
                      if (!line) return null;
                      return (
                        <li key={unit.lineIndex} className="text-sm">
                          {lineTitle(line, unit.quantity)}
                          {line.note ? <span className="block text-ink-soft">Catatan: {line.note}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="price mt-2 text-sm text-ink-soft">
                    Harga {formatRupiah(tx.subtotal)}
                    {tx.discount > 0 ? `, potongan ${formatRupiah(tx.discount)}` : ""}
                  </p>
                </li>
              ))}
            </ol>
            {order.pricing.itemPromos.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {order.pricing.itemPromos.map((p, i) => (
                  <li key={i}>
                    Promo item: {p.promoName} untuk {p.quantity}x {order.items[p.lineIndex]?.name ?? ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className={card} aria-labelledby="rincian">
            <h2 id="rincian" className="text-lg font-bold">
              Rincian bayar
            </h2>
            <dl className="price mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Harga menu</dt>
                <dd>{formatRupiah(order.subtotal)}</dd>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Diskon</dt>
                  <dd>-{formatRupiah(order.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-soft">Biaya jasa</dt>
                <dd>{formatRupiah(order.fee)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold">
                <dt>Dibayar customer</dt>
                <dd>{formatRupiah(order.total)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="space-y-4">
          {order.needsRefund ? (
            <section className="panel border-danger bg-danger/5 p-4" aria-labelledby="refund">
              <h2 id="refund" className="font-bold text-danger">
                Perlu refund {formatRupiah(order.total)}
              </h2>
              <p className="mt-1 text-sm">
                Pesanan dibatalkan setelah dibayar. Kirim uangnya ke {order.customerName} (
                <a href={`https://wa.me/${order.customerWa}`} target="_blank" rel="noopener noreferrer" className="underline">
                  {displayWa(order.customerWa)}
                </a>
                ), lalu tandai di sini.
              </p>
              <form action={refundDoneAction.bind(null, order.id)} className="mt-3">
                <SubmitButton className={btnPrimary} pending="Menyimpan...">
                  Refund sudah dikirim
                </SubmitButton>
              </form>
            </section>
          ) : null}

          <section className={card} aria-labelledby="ubah-status">
            <h2 id="ubah-status" className="text-lg font-bold">
              Ubah status
            </h2>
            <p className="mt-1 text-sm text-ink-soft">Sekarang: {STATUS_LABEL[order.status]}</p>
            {actions.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Pesanan ini sudah final, status tidak bisa diubah lagi.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {actions
                  .filter((s) => s !== "dibatalkan")
                  .map((s: OrderStatus) => (
                    <form key={s} action={changeOrderStatusAction.bind(null, order.id, s)}>
                      <SubmitButton className={`${s === actions.find((a) => a !== "dibatalkan") ? btnPrimary : btn} w-full`} pending="Memproses...">
                        {order.status === "kedaluwarsa" && s === "antrian" ? "Terima (customer sudah bayar)" : ACTION_LABEL[s]}
                      </SubmitButton>
                    </form>
                  ))}
                {actions.includes("dibatalkan") ? (
                  <details className="rounded-xl border border-danger/30 p-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-danger">Batalkan pesanan</summary>
                    <form action={changeOrderStatusAction.bind(null, order.id, "dibatalkan")} className="mt-2 space-y-2">
                      <label htmlFor="reason" className="block text-sm font-semibold">
                        Alasan (opsional)
                      </label>
                      <input id="reason" name="reason" maxLength={120} placeholder="Contoh: menu habis di outlet" className={input} />
                      {order.status !== "menunggu_pembayaran" ? <p className="text-xs text-ink-soft">Customer sudah bayar, jadi pesanan akan ditandai perlu refund.</p> : null}
                      <SubmitButton className={`${btnDanger} w-full`} pending="Membatalkan...">
                        Ya, batalkan
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}
              </div>
            )}
          </section>

          <section className={card} aria-labelledby="riwayat">
            <h2 id="riwayat" className="text-lg font-bold">
              Riwayat
            </h2>
            <ol className="mt-3 space-y-3 text-sm">
              {events.map((e, i) => (
                <li key={i}>
                  <p className="font-semibold">
                    {e.fromStatus && e.fromStatus !== e.toStatus ? `${STATUS_LABEL[e.fromStatus as OrderStatus] ?? e.fromStatus} → ` : ""}
                    {STATUS_LABEL[e.toStatus as OrderStatus] ?? e.toStatus}
                  </p>
                  <p className="text-ink-soft">
                    {formatDateTime(e.createdAt, timeZone)} · {e.actor}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
