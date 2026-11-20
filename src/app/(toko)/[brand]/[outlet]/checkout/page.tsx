import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/order/CheckoutForm";
import { ServiceStatus } from "@/components/storefront/ServiceStatus";
import { formatClock, PICKUP_LEAD_MINUTES, pickupOptions } from "@/core/orders/pickup";
import { getMenu } from "@/server/catalog";
import { getSiteSettings } from "@/server/config";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function CheckoutPage({ params }: PageProps<"/[brand]/[outlet]/checkout">) {
  const { brand, outlet } = await params;
  const [menu, settings] = await Promise.all([getMenu(brand, decode(outlet)), getSiteSettings()]);
  if (!menu) notFound();

  const now = new Date();
  const pickup = pickupOptions(settings, { open: menu.outlet.openTime, close: menu.outlet.closeTime }, now);
  const readyAt = formatClock(new Date(now.getTime() + PICKUP_LEAD_MINUTES * 60_000), settings.timeZone);

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-5 pt-5 pb-4">
        <Link href={`/${menu.brand.slug}/${encodeURIComponent(menu.outlet.code)}`} className="chip px-4 py-2 text-sm">
          ← Kembali ke menu
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Checkout</h1>
        <p className="text-ink-soft">
          {menu.brand.name} di {menu.outlet.name}
        </p>
        <div className="mt-3">
          <ServiceStatus settings={settings} now={now} />
        </div>
      </header>
      <CheckoutForm menu={menu} pickup={pickup} readyAt={readyAt} expiryMinutes={settings.paymentExpiryMinutes} />
    </main>
  );
}
