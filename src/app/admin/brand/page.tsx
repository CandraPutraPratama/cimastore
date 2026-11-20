import type { Metadata } from "next";
import Link from "next/link";
import { brandWarnings } from "@/core/admin/warnings";
import { setBrandActiveAction } from "../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { btn, btnPrimary, card } from "@/components/admin/styles";
import { Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { listBrands } from "@/server/admin/data";

export const metadata: Metadata = { title: "Brand dan promo" };

export default async function BrandsPage({ searchParams }: PageProps<"/admin/brand">) {
  await requireAdmin();
  const query = await searchParams;
  const brands = await listBrands();

  return (
    <>
      <PageTitle title="Brand dan promo">
        <Link href="/admin/brand/baru" className={btnPrimary}>
          Tambah brand
        </Link>
      </PageTitle>
      <Flash code={typeof query.info === "string" ? query.info : undefined} />
      <ul className="space-y-3">
        {brands.map((b) => {
          const warnings = brandWarnings(b);
          return (
            <li key={b.slug} className={`${card} flex flex-wrap items-center gap-4`}>
              <span aria-hidden className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: b.theme.accent ?? "var(--color-ink)" }} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{b.name}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${b.isActive ? "bg-hemat-soft text-hemat" : "bg-mist text-ink-soft"}`}>{b.isActive ? "Aktif" : "Nonaktif"}</span>
                </p>
                <p className="text-sm text-ink-soft">
                  {b.productCount} menu · {b.outletMode === "customer_input" ? "outlet diketik customer" : `${b.outletCount} outlet`} · {b.promoCount} promo aktif
                </p>
                {warnings.map((w) => (
                  <p key={w} className="mt-1 text-sm font-medium text-ink">
                    ⚠ {w}
                  </p>
                ))}
              </div>
              <div className="flex gap-2">
                <Link href={`/admin/brand/${b.slug}`} className={btn}>
                  Atur
                </Link>
                <form action={setBrandActiveAction.bind(null, b.slug, !b.isActive)}>
                  <SubmitButton className={b.isActive ? btn : btnPrimary} pending="Memproses...">
                    {b.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </SubmitButton>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-ink-soft">Brand nonaktif tidak tampil di beranda customer. Pesanan yang sudah berjalan tidak terpengaruh.</p>
    </>
  );
}
