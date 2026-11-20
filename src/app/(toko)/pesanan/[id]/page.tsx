import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { OrderView } from "@/components/order/OrderView";
import { toPublicOrder } from "@/core/orders/record";
import { getOrderForCustomer, paymentView } from "@/server/orders";

export const metadata: Metadata = {
  title: "Pesanan",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OrderPage({ params, searchParams }: PageProps<"/pesanan/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : null;
  const order = token ? await getOrderForCustomer(id, token) : null;

  if (!order || !token) {
    return (
      <main className="flex flex-1 flex-col items-start gap-3 px-5 py-10">
        <h1 className="text-3xl font-semibold">Pesanan tidak ditemukan</h1>
        <p className="text-ink-soft">Buka lagi link pesanan dari HP yang dipakai memesan, atau dari pesan WhatsApp ke admin.</p>
        <Link href="/" className="btn px-5 py-3">
          Ke halaman utama
        </Link>
      </main>
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const payment = await paymentView(order, token, host ? `${proto}://${host}` : undefined);

  return <OrderView initialOrder={toPublicOrder(order)} token={token} payment={payment} serverNow={new Date().toISOString()} />;
}
