import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "./actions";
import { isAdmin } from "@/server/admin/auth";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin Jasdor" },
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin/pesanan", label: "Pesanan" },
  { href: "/admin/brand", label: "Brand dan promo" },
  { href: "/admin/pengaturan", label: "Pengaturan" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const signedIn = await isAdmin();
  return (
    <div className="toko min-h-dvh bg-mist">
      <header className="border-b-[2.5px] border-ink bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-4 py-2">
          <Link href="/admin" className="flex items-center gap-2 py-2 font-display text-xl font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo statis kecil; optimasi gambar Next tidak dipakai di Workers. */}
            <img src="/logo-jasdor.webp" width={36} height={36} alt="" className="size-9 rounded-full" />
            <span>
              jasdor <span className="font-sans text-sm font-semibold text-ink-soft">admin</span>
            </span>
          </Link>
          {signedIn ? (
            <>
              <nav aria-label="Menu admin" className="order-last flex w-full gap-x-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:order-none sm:w-auto sm:flex-1 sm:pb-0">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm font-bold text-ink hover:bg-spark">
                    {item.label}
                  </Link>
                ))}
              </nav>
              <form action={logoutAction} className="ml-auto sm:ml-0">
                <button type="submit" className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-bold text-ink hover:bg-spark">
                  Keluar
                </button>
              </form>
            </>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
