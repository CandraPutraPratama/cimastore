import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { describePromo } from "@/core/admin/types";
import { promoMarginWarnings, brandWarnings } from "@/core/admin/warnings";
import { deletePromoAction, setPromoActiveAction } from "../../actions";
import { BrandLogoForm } from "@/components/admin/BrandLogoForm";
import { BrandForm } from "@/components/admin/BrandForm";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { formatDateTime } from "@/components/admin/format";
import { btn, btnDanger, btnPrimary, card } from "@/components/admin/styles";
import { Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getBrand, getSettings } from "@/server/admin/data";

export const metadata: Metadata = { title: "Atur brand" };

export default async function BrandPage({ params, searchParams }: PageProps<"/admin/brand/[slug]">) {
  await requireAdmin();
  const { slug } = await params;
  const query = await searchParams;
  const [brand, settings] = await Promise.all([getBrand(slug), getSettings()]);
  if (!brand) notFound();

  const warnings = [...brandWarnings(brand), ...promoMarginWarnings(brand.feeRules, brand.promos)];

  return (
    <>
      <p className="mb-3">
        <Link href="/admin/brand" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; Semua brand
        </Link>
      </p>
      <PageTitle title={brand.name}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/brand/${brand.slug}/impor`} className={btn}>
            Impor menu CSV
          </Link>
          <Link href={`/admin/brand/${brand.slug}/menu`} className={btn}>
            Atur menu
          </Link>
        </div>
      </PageTitle>
      <Flash code={typeof query.info === "string" ? query.info : undefined} />

      {warnings.length > 0 ? (
        <ul role="note" className="mb-4 space-y-1 rounded-xl bg-marigold/25 px-4 py-3 text-sm font-medium">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}

      <section className={`${card} mb-6`} aria-labelledby="logo-brand">
        <h2 id="logo-brand" className="mb-4 text-lg font-bold">
          Logo brand
        </h2>
        <BrandLogoForm slug={brand.slug} name={brand.name} accent={brand.theme.accent} logoUrl={brand.logoUrl} />
      </section>

      <section className={`${card} mb-6`} aria-labelledby="pengaturan-brand">
        <h2 id="pengaturan-brand" className="mb-4 text-lg font-bold">
          Pengaturan brand
        </h2>
        <BrandForm brand={brand} />
      </section>

      <section aria-labelledby="promo">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="promo" className="text-lg font-bold">
            Promo
          </h2>
          <Link href={`/admin/brand/${brand.slug}/promo/baru`} className={btnPrimary}>
            Tambah promo
          </Link>
        </div>
        {brand.promos.length === 0 ? (
          <p className={`${card} text-ink-soft`}>Belum ada promo. Brand ini dijual tanpa potongan.</p>
        ) : (
          <ul className="space-y-3">
            {brand.promos.map((p) => (
              <li key={p.id} className={card}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{p.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${p.active ? "bg-hemat-soft text-hemat" : "bg-mist text-ink-soft"}`}>{p.active ? "Aktif" : "Nonaktif"}</span>
                      <span className="rounded-md bg-mist px-2 py-0.5 text-xs font-semibold text-ink-soft">{p.level === "item" ? "Promo produk" : "Voucher transaksi"}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">{describePromo(p)}</p>
                    {p.productNames.length > 0 ? (
                      <p className="mt-1 text-sm text-ink-soft">
                        Produk: {p.productNames.slice(0, 4).join(", ")}
                        {p.productNames.length > 4 ? ` dan ${p.productNames.length - 4} lainnya` : ""}
                      </p>
                    ) : null}
                    {p.startsAt || p.endsAt ? (
                      <p className="mt-1 text-sm text-ink-soft">
                        {p.startsAt ? `Mulai ${formatDateTime(p.startsAt, settings.timeZone)}` : ""}
                        {p.startsAt && p.endsAt ? ", " : ""}
                        {p.endsAt ? `berakhir ${formatDateTime(p.endsAt, settings.timeZone)}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/brand/${brand.slug}/promo/${p.id}`} className={btn}>
                      Ubah
                    </Link>
                    <form action={setPromoActiveAction.bind(null, brand.slug, p.id, !p.active)}>
                      <SubmitButton className={btn} pending="Memproses...">
                        {p.active ? "Nonaktifkan" : "Aktifkan"}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-danger">Hapus promo</summary>
                  <form action={deletePromoAction.bind(null, brand.slug, p.id)} className="mt-1 flex flex-wrap items-center gap-3">
                    <p className="text-sm">Promo ini dihapus permanen. Pesanan lama tidak terpengaruh.</p>
                    <SubmitButton className={btnDanger} pending="Menghapus...">
                      Ya, hapus
                    </SubmitButton>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
