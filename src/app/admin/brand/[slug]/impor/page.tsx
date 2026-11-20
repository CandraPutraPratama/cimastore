import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CsvImportForm } from "@/components/admin/CsvImportForm";
import { formatDateTime } from "@/components/admin/format";
import { card } from "@/components/admin/styles";
import { PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getBrand, listImportRuns } from "@/server/admin/data";

export const metadata: Metadata = { title: "Impor menu CSV" };

export default async function ImportPage({ params }: PageProps<"/admin/brand/[slug]/impor">) {
  await requireAdmin();
  const { slug } = await params;
  const brand = await getBrand(slug);
  if (!brand) notFound();
  const runs = await listImportRuns(slug);

  return (
    <>
      <p className="mb-3">
        <Link href={`/admin/brand/${slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; {brand.name}
        </Link>
      </p>
      <PageTitle title={`Impor menu ${brand.name}`} />
      <div className="max-w-3xl space-y-5">
        <section className={`${card} space-y-2 text-sm`}>
          <h2 className="font-bold">Cara pakai</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Unduh contoh file:{" "}
              <a href="/templat/menu.csv" download className="font-semibold underline">
                menu.csv
              </a>
              {brand.outletMode === "catalog" ? (
                <>
                  {" "}
                  dan{" "}
                  <a href="/templat/outlet.csv" download className="font-semibold underline">
                    outlet.csv
                  </a>
                </>
              ) : null}
              , isi di Excel atau Google Sheets.
            </li>
            <li>Simpan sebagai CSV (di Excel pilih &quot;CSV UTF-8&quot;). Pemisah koma atau titik koma sama-sama bisa.</li>
            <li>Harga boleh ditulis 35000, 35.000, atau Rp35.000.</li>
            <li>Unggah di bawah, periksa hasilnya, lalu impor. Tidak ada yang berubah sebelum kamu menekan Impor.</li>
          </ol>
          <p className="text-ink-soft">
            Impor ulang aman: produk yang namanya sama (di kategori yang sama) diperbarui, bukan digandakan. Menu yang kamu sembunyikan tetap tersembunyi. Impor lewat CSV tidak mengubah ukuran/opsi minuman dan tidak cocok untuk brand dengan harga berbeda per outlet.
          </p>
        </section>

        <CsvImportForm slug={slug} outletMode={brand.outletMode} />

        {runs.length > 0 ? (
          <section className={card} aria-label="Riwayat impor">
            <h2 className="mb-2 font-bold">Impor terakhir</h2>
            <ul className="divide-y divide-line text-sm">
              {runs.map((r) => (
                <li key={r.startedAt} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>{formatDateTime(r.startedAt)}</span>
                  <span className="text-ink-soft">
                    {r.source} · {r.status === "success" ? "berhasil" : r.status}
                    {r.stats.products?.upserted !== undefined ? ` · ${r.stats.products.upserted} produk` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
