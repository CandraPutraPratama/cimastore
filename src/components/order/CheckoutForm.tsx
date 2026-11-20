"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { MenuPayload } from "@/core/catalog/storefront";
import { formatRupiah } from "@/core/money/format";
import { priceCart } from "@/core/orders/cart";
import { normalizeWhatsapp } from "@/core/orders/checkout";
import type { PickupOptions } from "@/core/orders/pickup";
import { useCart } from "../storefront/useCart";
import { customerSnapshot, rememberOrder, saveCustomer } from "./localOrders";
import { OrderSummary, type SummaryLine } from "./OrderSummary";

interface Props {
  menu: MenuPayload;
  pickup: PickupOptions;
  /** Jam siap bila diambil secepatnya, contoh "14.17". */
  readyAt: string;
  expiryMinutes: number;
}

const noSubscribe = () => () => {};
const inputClass =
  "field mt-1.5 block aria-[invalid=true]:border-danger";

export function CheckoutForm({ menu, pickup, readyAt, expiryMinutes }: Props) {
  const router = useRouter();
  const menuHref = `/${menu.brand.slug}/${encodeURIComponent(menu.outlet.code)}`;
  const { items, ready, clear } = useCart(menu.brand.slug, menu.outlet.code);
  const saved = useSyncExternalStore(noSubscribe, customerSnapshot, () => null);

  const [name, setName] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [mode, setMode] = useState<"now" | "scheduled">(pickup.nowAvailable ? "now" : "scheduled");
  const [time, setTime] = useState(pickup.slots[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"name" | "whatsapp" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameValue = name ?? saved?.name ?? "";
  const waValue = whatsapp ?? saved?.whatsapp ?? "";

  const cart = useMemo(() => priceCart(menu, items), [menu, items]);
  const lines: SummaryLine[] = cart.results.flatMap((r, i) =>
    r.ok
      ? [
          {
            key: items[i].key,
            name: r.line.name,
            details: r.line.options.map((o) => o.name).join(", "),
            note: r.line.note,
            quantity: r.line.quantity,
            lineTotal: r.line.unitPrice * r.line.quantity,
          },
        ]
      : [],
  );
  const order = cart.order;

  if (!ready) return <div className="flex-1" />;

  if (order.itemCount === 0 || cart.hasProblems) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 px-5 py-10">
        <p className="text-lg font-bold">{cart.hasProblems ? "Ada menu di keranjang yang berubah." : "Keranjangmu masih kosong."}</p>
        <p className="text-ink-soft">{cart.hasProblems ? "Cek lagi keranjangmu sebelum checkout." : "Pilih menu dulu, lalu kembali ke sini."}</p>
        <Link href={menuHref} className="btn px-5 py-3">
          Kembali ke menu
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (!/\p{L}/u.test(nameValue)) {
      setFieldError("name");
      setError("Isi nama pemesan.");
      return;
    }
    if (!normalizeWhatsapp(waValue)) {
      setFieldError("whatsapp");
      setError("Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: menu.brand.slug,
          outlet: menu.outlet.code,
          customer: { name: nameValue, whatsapp: waValue },
          pickup: mode === "now" ? { mode: "now" } : { mode: "scheduled", time },
          items: items.map((i) => ({ productId: i.productId, optionIds: i.optionIds, quantity: i.quantity, ...(i.note ? { note: i.note } : {}) })),
          expectedTotal: order.total,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; path?: string; error?: string; code?: string };
      if (!res.ok || !data.path || !data.id) {
        if (data.code === "INVALID_NAME") setFieldError("name");
        if (data.code === "INVALID_WHATSAPP") setFieldError("whatsapp");
        setError(data.error ?? "Pesanan gagal dibuat. Coba lagi.");
        // Harga/menu berubah: muat ulang menu supaya keranjang dihitung dengan data terbaru.
        if (data.code === "PRICE_CHANGED" || data.code === "CART_CHANGED" || data.code === "PICKUP_UNAVAILABLE") router.refresh();
        setSubmitting(false);
        return;
      }
      saveCustomer({ name: nameValue.trim(), whatsapp: waValue.trim() });
      rememberOrder({
        id: data.id,
        path: data.path,
        brandName: menu.brand.name,
        outletName: menu.outlet.name,
        total: order.total,
        createdAt: new Date().toISOString(),
      });
      clear();
      router.replace(data.path);
    } catch {
      setError("Koneksi terputus. Cek internet lalu coba lagi.");
      setSubmitting(false);
    }
  }

  const blocked = !pickup.canOrder;

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col pb-36">
      <section className="px-5 pt-2 pb-5" aria-labelledby="judul-pemesan">
        <h2 id="judul-pemesan" className="text-lg font-bold">
          Data pemesan
        </h2>
        <label className="mt-3 block">
          <span className="text-sm font-semibold">Nama</span>
          <input
            name="name"
            autoComplete="name"
            maxLength={60}
            value={nameValue}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={fieldError === "name"}
            className={inputClass}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-semibold">Nomor WhatsApp</span>
          <input
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            maxLength={20}
            value={waValue}
            onChange={(e) => setWhatsapp(e.target.value)}
            aria-invalid={fieldError === "whatsapp"}
            aria-describedby="wa-hint"
            className={inputClass}
          />
          <span id="wa-hint" className="mt-1 block text-xs text-ink-faint">
            Admin mengabari status pesanan lewat nomor ini.
          </span>
        </label>
      </section>

      <section className="border-t-2 border-dashed border-ink/30 px-5 py-5" aria-labelledby="judul-ambil">
        <h2 id="judul-ambil" className="text-lg font-bold">
          Waktu ambil
        </h2>
        <p className="text-sm text-ink-soft">di {menu.outlet.name}</p>
        {blocked ? (
          <p className="mt-3 rounded-xl border-2 border-dashed border-ink/40 bg-mist px-4 py-3 text-sm">{pickup.reason}</p>
        ) : (
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Waktu ambil">
            {pickup.nowAvailable ? (
              <label className="choice flex cursor-pointer items-center gap-3 px-4 py-3">
                <input type="radio" name="pickup" checked={mode === "now"} onChange={() => setMode("now")} className="size-4 accent-ink" />
                <span>
                  <span className="block font-semibold">Secepatnya</span>
                  <span className="block text-sm text-ink-soft">Siap sekitar {readyAt} setelah pembayaran dicek</span>
                </span>
              </label>
            ) : null}
            {pickup.slots.length > 0 ? (
              <label className="choice flex cursor-pointer items-center gap-3 px-4 py-3">
                <input type="radio" name="pickup" checked={mode === "scheduled"} onChange={() => setMode("scheduled")} className="size-4 accent-ink" />
                <span className="flex flex-1 flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">Pilih jam hari ini</span>
                  <select
                    aria-label="Jam ambil"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setMode("scheduled");
                    }}
                    className="field w-auto px-3 py-1.5"
                  >
                    {pickup.slots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot.replace(":", ".")}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            ) : null}
          </div>
        )}
      </section>

      <section className="border-t-[2.5px] border-ink bg-mist px-4 py-5" aria-labelledby="judul-rincian">
        <h2 id="judul-rincian" className="px-1 pb-3 text-lg font-bold">
          Rincian
        </h2>
        <OrderSummary lines={lines} totals={{ ...order }} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t-[2.5px] border-ink bg-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p role="alert" className="mb-2 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || blocked}
          className="btn flex w-full items-center justify-between px-5 py-3"
        >
          <span>{submitting ? "Membuat pesanan..." : "Buat pesanan"}</span>
          <span className="price">{formatRupiah(order.total)}</span>
        </button>
        <p className="mt-2 text-center text-xs text-ink-faint">Bayar lewat QRIS di langkah berikutnya, maksimal {expiryMinutes} menit.</p>
      </div>
    </form>
  );
}
