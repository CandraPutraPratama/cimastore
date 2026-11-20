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
    <div className="min-h-dvh bg-mist">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
          <Link href="/admin" className="py-2 text-lg font-extrabold tracking-tight">
            jasdor <span className="text-sm font-semibold text-ink-soft">admin</span>
          </Link>
          {signedIn ? (
            <>
              <nav aria-label="Menu admin" className="flex flex-1 flex-wrap gap-x-1">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-ink-soft hover:bg-mist hover:text-ink">
                    {item.label}
                  </Link>
                ))}
              </nav>
              <form action={logoutAction}>
                <button type="submit" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-ink-soft hover:bg-mist hover:text-ink">
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
