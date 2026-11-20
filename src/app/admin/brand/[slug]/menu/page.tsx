import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRupiah } from "@/core/money/format";
import { setProductVisibleAction } from "../../../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { btn, btnPrimary, card, input } from "@/components/admin/styles";
import { Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getBrand, listProducts } from "@/server/admin/data";

export const metadata: Metadata = { title: "Tampilan menu" };

export default async function MenuPage({ params, searchParams }: PageProps<"/admin/brand/[slug]/menu">) {
  await requireAdmin();
  const { slug } = await params;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const [brand, products] = await Promise.all([getBrand(slug), listProducts(slug, q)]);
  if (!brand) notFound();

  const price = (min: number | null, max: number | null) => (min === null ? "belum ada harga" : min === max ? formatRupiah(min) : `${formatRupiah(min)} - ${formatRupiah(max ?? min)}`);

  // Kelompokkan per kategori (urutan dari database dipertahankan).
  const groups: Array<{ category: string; items: typeof products }> = [];
  for (const p of products) {
    const last = groups[groups.length - 1];
    if (last?.category === p.category) last.items.push(p);
    else groups.push({ category: p.category, items: [p] });
  }

  return (
    <>
      <p className="mb-3">
        <Link href={`/admin/brand/${slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; {brand.name}
        </Link>
      </p>
      <PageTitle title={`Menu ${brand.name}`}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/brand/${slug}/impor`} className={btn}>
            Impor CSV
          </Link>
          <Link href={`/admin/brand/${slug}/menu/baru`} className={btnPrimary}>
            Tambah produk
          </Link>
        </div>
      </PageTitle>
      <Flash code={typeof query.info === "string" ? query.info : undefined} />
      <p className="mb-4 text-sm text-ink-soft">Menu yang disembunyikan tidak tampil di semua outlet. Pilihan ini tetap berlaku setelah menu diimpor ulang.</p>

      <form action={`/admin/brand/${slug}/menu`} role="search" className="mb-4 flex gap-2">
        <input type="search" name="q" defaultValue={q} placeholder="Cari menu atau kategori" aria-label="Cari menu" className={input} />
        <button type="submit" className={btn}>
          Cari
        </button>
      </form>

      {products.length === 0 ? (
        <p className={`${card} text-ink-soft`}>{q ? "Tidak ada menu yang cocok." : "Brand ini belum punya menu."}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.category} className={card} aria-label={g.category}>
              <h2 className="mb-2 font-bold">{g.category}</h2>
              <ul className="divide-y divide-line">
                {g.items.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${p.isVisible && p.isActive ? "" : "text-ink-faint"}`}>{p.name}</p>
                      <p className="price text-sm text-ink-soft">
                        {price(p.minPrice, p.maxPrice)}
                        {!p.isActive ? " · tidak ada di sumber data" : ""}
                      </p>
                    </div>
                    <Link href={`/admin/brand/${slug}/menu/${p.id}`} className={btn}>
                      Ubah
                    </Link>
                    <form action={setProductVisibleAction.bind(null, slug, p.id, !p.isVisible)}>
                      <SubmitButton className={p.isVisible ? btn : btnPrimary} pending="...">
                        {p.isVisible ? "Sembunyikan" : "Tampilkan"}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
