"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatRupiah } from "@/core/money/format";
import { whatsappLink } from "@/core/orders/messages";
import { formatClock, pickupLabel } from "@/core/orders/pickup";
import type { PublicOrder } from "@/core/orders/record";
import { isFinalStatus, type OrderStatus } from "@/core/orders/status";
import { OrderSummary, type SummaryLine } from "./OrderSummary";
import { QrisCode, qrisPngBlob } from "./QrisCode";

export interface PaymentInfo {
  qris: string | null;
  merchantName?: string;
  nmid?: string;
  whatsappUrl: string;
  adminWhatsapp: string;
  timeZone: string;
}

interface Props {
  initialOrder: PublicOrder;
  token: string;
  payment: PaymentInfo;
  serverNow: string;
}

const POLL_MS = 10_000;

function remainingText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const PROGRESS: Array<{ status: OrderStatus; label: string }> = [
  { status: "antrian", label: "Antrian" },
  { status: "diproses", label: "Dibelikan" },
  { status: "selesai", label: "Selesai" },
];

const PAID_COPY: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  menunggu_konfirmasi: { title: "Menunggu konfirmasi admin", body: "Admin sedang mengecek pembayaranmu." },
  antrian: { title: "Pesananmu masuk antrian", body: "Admin mengecek bukti bayar di WhatsApp, lalu membelikan pesananmu sesuai urutan." },
  diproses: { title: "Pesananmu sedang dibelikan", body: "Admin sedang memesan di aplikasi brand. Kamu dikabari lewat WhatsApp saat siap diambil." },
  selesai: { title: "Pesanan selesai", body: "Pesananmu sudah dibelikan. Tinggal diambil di outlet. Terima kasih sudah pesan di Jasdor!" },
};

export function OrderView({ initialOrder, token, payment, serverNow }: Props) {
  const [order, setOrder] = useState(initialOrder);
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const [notice, setNotice] = useState<string | null>(null);
  const skew = useRef(0);
  const expiryChecked = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}`, { headers: { "x-order-token": token }, cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { order?: PublicOrder };
      if (data.order) setOrder(data.order);
    } catch {
      // Offline sebentar: coba lagi di putaran berikutnya.
    }
  }, [order.id, token]);

  // Jam berjalan (dikoreksi selisih jam HP dengan server) dan cek status berkala.
  useEffect(() => {
    skew.current = new Date(serverNow).getTime() - Date.now();
    const tick = setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => clearInterval(tick);
  }, [serverNow]);

  const final = isFinalStatus(order.status);
  useEffect(() => {
    if (final) return;
    const poll = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [final, refresh]);

  const remaining = new Date(order.expiresAt).getTime() - now;
  const waiting = order.status === "menunggu_pembayaran";
  useEffect(() => {
    if (waiting && remaining <= 0 && !expiryChecked.current) {
      expiryChecked.current = true;
      void refresh();
    }
  }, [waiting, remaining, refresh]);

  function confirmPaid() {
    setNotice(null);
    // keepalive: tetap terkirim walau browser pindah ke aplikasi WhatsApp.
    fetch(`/api/orders/${order.id}/confirm`, { method: "POST", headers: { "x-order-token": token }, keepalive: true })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { order?: PublicOrder; error?: string };
        if (data.order) setOrder(data.order);
        if (!res.ok) {
          setNotice(data.error ?? "Konfirmasi gagal. Coba lagi.");
          void refresh();
        }
      })
      .catch(() => setNotice("Koneksi terputus. Buka lagi halaman ini setelah online."));
  }

  const lines: SummaryLine[] = order.items.map((line, i) => ({
    key: String(i),
    name: line.name,
    details: line.options.map((o) => o.name).join(", "),
    note: line.note,
    quantity: line.quantity,
    lineTotal: line.unitPrice * line.quantity,
  }));
  const pickup = pickupLabel(order.pickupMode, new Date(order.pickupAt), payment.timeZone);
  const chatAdmin = whatsappLink(payment.adminWhatsapp, `Halo Kak, saya mau tanya pesanan #${order.id}`);
  const menuHref = order.outletCode ? `/${order.brand.slug}/${encodeURIComponent(order.outletCode)}` : `/${order.brand.slug}`;

  const header = (
    <header className="px-5 pt-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <span aria-hidden className="h-4 w-1 rounded-full" style={{ background: order.brand.accent ?? "var(--color-ink)" }} />
        {order.brand.name} di {order.outletLabel}
      </p>
      <p className="mt-1 text-sm text-ink-faint">
        Kode pesanan <span className="price font-semibold text-ink">{order.id}</span>
      </p>
    </header>
  );

  const details = (
    <section className="mt-6 border-t border-line bg-mist px-4 py-5" aria-labelledby="judul-rincian">
      <h2 id="judul-rincian" className="px-1 text-lg font-bold">
        Rincian pesanan
      </h2>
      <p className="px-1 pb-3 text-sm text-ink-soft">
        {order.customerName}, ambil di {order.outletLabel}. {pickup}.
      </p>
      <OrderSummary lines={lines} totals={{ itemCount: order.pricing.itemCount, subtotal: order.subtotal, discount: order.discount, fee: order.fee, total: order.total, savings: order.pricing.savings }} />
    </section>
  );

  if (waiting) {
    const deadline = formatClock(new Date(order.expiresAt), payment.timeZone);
    return (
      <main className="flex flex-1 flex-col pb-40">
        {header}
        <section className="px-5 pt-6" aria-labelledby="judul-bayar">
          <h1 id="judul-bayar" className="text-sm font-semibold text-ink-soft">
            Total bayar
          </h1>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="price text-[2.75rem] leading-none font-extrabold tracking-tight">{formatRupiah(order.total)}</p>
            <CopyButton text={String(order.total)} label="Salin nominal" />
          </div>
          <p className="mt-2 text-sm" aria-live="polite">
            Bayar sebelum <span className="font-semibold">{deadline} WIB</span>
            <span className="text-ink-soft"> (sisa {remainingText(remaining)})</span>
          </p>
        </section>

        {payment.qris ? (
          <section className="mx-5 mt-5 rounded-3xl border border-line p-5" aria-label="Kode QRIS">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-lg font-extrabold tracking-tight">QRIS</p>
              <p className="text-right text-sm">
                <span className="block font-semibold">{payment.merchantName}</span>
                {payment.nmid ? <span className="block text-xs text-ink-faint">NMID {payment.nmid}</span> : null}
              </p>
            </div>
            <div className="mx-auto mt-3 max-w-[260px]">
              <QrisCode payload={payment.qris} label={`QRIS ${payment.merchantName ?? ""} sebesar ${formatRupiah(order.total)}`} />
            </div>
            <p className="mt-3 text-center text-sm text-ink-soft">Nominal {formatRupiah(order.total)} sudah terisi otomatis.</p>
            <SaveQrButton payload={payment.qris} orderId={order.id} lines={[formatRupiah(order.total), `${payment.merchantName ?? ""} - ${order.id}`]} />
          </section>
        ) : (
          <p className="mx-5 mt-5 rounded-xl bg-marigold/20 px-4 py-3 text-sm">
            QRIS sedang bermasalah. <a href={chatAdmin} target="_blank" rel="noopener" className="font-semibold underline">Chat admin</a> untuk cara bayar.
          </p>
        )}

        <section className="px-5 pt-6" aria-labelledby="judul-cara">
          <h2 id="judul-cara" className="text-lg font-bold">
            Cara bayar
          </h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-ink-soft marker:font-semibold marker:text-ink">
            <li>Scan QR dari aplikasi e-wallet atau m-banking. Pesan dari HP yang sama? Simpan gambar QR lalu pilih dari galeri.</li>
            <li>
              Pastikan penerima <span className="font-semibold text-ink">{payment.merchantName ?? "sesuai QR"}</span> dan nominal{" "}
              <span className="price font-semibold text-ink">{formatRupiah(order.total)}</span>.
            </li>
            <li>Tekan tombol di bawah, lalu kirim foto bukti bayar di WhatsApp.</li>
          </ol>
        </section>

        {details}

        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-line bg-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {notice ? (
            <p role="alert" className="mb-2 text-sm font-semibold text-danger">
              {notice}
            </p>
          ) : null}
          <a
            href={payment.whatsappUrl}
            target="_blank"
            rel="noopener"
            onClick={confirmPaid}
            className="flex w-full items-center justify-center rounded-full bg-ink px-5 py-3.5 text-center font-semibold text-paper"
          >
            Sudah bayar, kirim bukti ke WhatsApp
          </a>
          <p className="mt-2 text-center text-xs text-ink-faint">Pesanan diproses setelah bukti bayar masuk.</p>
        </div>
      </main>
    );
  }

  if (order.status === "kedaluwarsa" || order.status === "dibatalkan") {
    const expired = order.status === "kedaluwarsa";
    const paidLate = whatsappLink(
      payment.adminWhatsapp,
      `Halo Kak, pesanan #${order.id} sudah kedaluwarsa tapi saya sudah terlanjur bayar ${formatRupiah(order.total)}. Mohon dicek.`,
    );
    return (
      <main className="flex flex-1 flex-col pb-10">
        {header}
        <section className="px-5 pt-6">
          <h1 className="text-2xl font-extrabold tracking-tight">{expired ? "Batas bayar habis" : "Pesanan dibatalkan"}</h1>
          <p className="mt-2 text-ink-soft">
            {expired
              ? "Pesanan ini dibatalkan otomatis karena belum dibayar."
              : `${order.cancellationReason ? `${order.cancellationReason}. ` : ""}Kalau kamu sudah bayar, admin menghubungimu untuk pengembalian dana.`}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link href={menuHref} className="rounded-full bg-ink px-5 py-3 text-center font-semibold text-paper">
              Pesan lagi
            </Link>
            <a href={expired ? paidLate : chatAdmin} target="_blank" rel="noopener" className="rounded-full border border-line px-5 py-3 text-center font-semibold">
              {expired ? "Sudah terlanjur bayar? Chat admin" : "Chat admin"}
            </a>
          </div>
        </section>
        {details}
      </main>
    );
  }

  const copy = PAID_COPY[order.status] ?? PAID_COPY.antrian!;
  const currentStep = PROGRESS.findIndex((p) => p.status === order.status);
  return (
    <main className="flex flex-1 flex-col pb-10">
      {header}
      <section className="px-5 pt-6" aria-live="polite">
        <h1 className="text-2xl font-extrabold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-ink-soft">{copy.body}</p>
        <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Progres pesanan">
          {PROGRESS.map((step, i) => {
            const done = currentStep >= i;
            return (
              <li key={step.status} aria-current={i === currentStep ? "step" : undefined}>
                <span className={`block h-1.5 rounded-full ${done ? "bg-hemat" : "bg-line"}`} />
                <span className={`mt-1.5 block text-sm ${i === currentStep ? "font-bold" : done ? "text-ink-soft" : "text-ink-faint"}`}>{step.label}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 rounded-xl bg-mist px-4 py-3 text-sm">
          Ambil di <span className="font-semibold">{order.outletLabel}</span>. {pickup}.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {order.status !== "selesai" ? (
            <a href={payment.whatsappUrl} target="_blank" rel="noopener" className="rounded-full bg-ink px-5 py-3 text-center font-semibold text-paper">
              Kirim bukti bayar di WhatsApp
            </a>
          ) : null}
          <a href={chatAdmin} target="_blank" rel="noopener" className="rounded-full border border-line px-5 py-3 text-center font-semibold">
            Chat admin
          </a>
        </div>
      </section>
      {details}
    </main>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // Clipboard diblokir browser: abaikan.
        }
      }}
      className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold"
    >
      {done ? "Tersalin" : label}
    </button>
  );
}

function SaveQrButton({ payload, orderId, lines }: { payload: string; orderId: string; lines: string[] }) {
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const blob = await qrisPngBlob(payload, lines);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `QRIS-${orderId}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          setState("saved");
        } catch {
          setState("failed");
        }
      }}
      className="mt-3 w-full rounded-full border border-line px-4 py-2.5 text-sm font-semibold"
    >
      {state === "saved" ? "Gambar QR tersimpan" : state === "failed" ? "Gagal menyimpan, coba screenshot" : "Simpan gambar QR"}
    </button>
  );
}
