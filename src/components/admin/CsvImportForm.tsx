"use client";

import { useActionState } from "react";
import Link from "next/link";
import { csvImportAction } from "@/app/admin/actions";
import { formatRupiah } from "@/core/money/format";
import { btn, btnPrimary, card, input } from "./styles";
import { FormMessage } from "./ui";

export function CsvImportForm({ slug, outletMode }: { slug: string; outletMode: "catalog" | "customer_input" }) {
  const [state, action, pending] = useActionState(csvImportAction.bind(null, slug), undefined);
  const deactivate = state?.deactivateMissing ?? true;
  const preview = state?.preview;

  return (
    <div className="space-y-5">
      {state?.ok ? (
        <div className={`${card} space-y-3`}>
          <FormMessage state={state} />
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/brand/${slug}/menu`} className={btnPrimary}>
              Lihat menu
            </Link>
            <Link href={`/admin/brand/${slug}`} className={btn}>
              Kembali ke brand
            </Link>
          </div>
        </div>
      ) : (
        <form action={action} className={`${card} space-y-4`} encType="multipart/form-data">
          <input type="hidden" name="intent" value="periksa" />
          <div>
            <label htmlFor="menuFile" className="mb-1 block text-sm font-semibold">
              File menu (CSV)
            </label>
            <input id="menuFile" name="menuFile" type="file" accept=".csv,text/csv" required className={input} />
            <p className="mt-1 text-xs text-ink-soft">Kolom wajib: kategori, nama, harga. Opsional: deskripsi, foto, kode.</p>
          </div>
          {outletMode === "catalog" ? (
            <div>
              <label htmlFor="outletFile" className="mb-1 block text-sm font-semibold">
                File outlet (CSV), opsional
              </label>
              <input id="outletFile" name="outletFile" type="file" accept=".csv,text/csv" className={input} />
              <p className="mt-1 text-xs text-ink-soft">Kolom wajib: kode, nama. Opsional: kota, alamat, buka, tutup, lat, lng. Tanpa file ini, outlet yang sudah ada tidak diubah.</p>
            </div>
          ) : null}
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name="deactivateMissing" defaultChecked={deactivate} className="mt-1 size-5 shrink-0" />
            <span>
              <span className="font-semibold">Nonaktifkan yang tidak ada di file</span>
              <span className="block text-ink-soft">Produk lama yang tidak tercantum di file disembunyikan dari customer. Pesanan lama tetap aman.</span>
            </span>
          </label>
          {!preview && state?.message ? <FormMessage state={state} /> : null}
          {state?.issues ? (
            <div role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              <p className="mb-1 font-semibold">{state.message}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {state.issues.map((i, n) => (
                  <li key={n}>
                    {i.file === "menu" ? "Menu" : i.file === "outlet" ? "Outlet" : "File"}
                    {i.line ? `, baris ${i.line}` : ""}: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Memeriksa..." : "Periksa file"}
          </button>
        </form>
      )}

      {preview && !state?.ok ? (
        <section className={`${card} space-y-4`} aria-label="Hasil pemeriksaan">
          <h2 className="text-lg font-bold">File sudah diperiksa, belum ada yang diubah</h2>
          <ul className="space-y-1 text-sm">
            <li>
              <span className="font-semibold">{preview.products} produk</span> dalam {preview.categories} kategori: {preview.newProducts} baru, {preview.updatedProducts} diperbarui.
            </li>
            {preview.missingProducts > 0 ? (
              <li className="font-medium">
                {preview.missingProducts} produk lama tidak ada di file: {deactivate ? "akan disembunyikan dari customer." : "dibiarkan seperti sekarang."}
              </li>
            ) : null}
            {preview.outlets !== null ? (
              <li>
                <span className="font-semibold">{preview.outlets} outlet</span>: {preview.newOutlets} baru.
                {preview.missingOutlets > 0 ? ` ${preview.missingOutlets} outlet lama tidak ada di file${deactivate ? " dan akan dinonaktifkan." : "."}` : ""}
              </li>
            ) : null}
            {preview.warnings.map((w) => (
              <li key={w} className="font-medium">
                ⚠ {w}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-1 text-left text-xs text-ink-soft">Contoh baris pertama</caption>
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="py-1 pr-3 font-medium">Kategori</th>
                  <th className="py-1 pr-3 font-medium">Nama</th>
                  <th className="py-1 font-medium">Harga</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-1 pr-3">{r.category}</td>
                    <td className="py-1 pr-3">{r.name}</td>
                    <td className="price py-1">{formatRupiah(r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="intent" value="impor" />
            <input type="hidden" name="menuText" value={state?.menuText ?? ""} />
            <input type="hidden" name="outletText" value={state?.outletText ?? ""} />
            {deactivate ? <input type="hidden" name="deactivateMissing" value="on" /> : null}
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Mengimpor..." : "Impor sekarang"}
            </button>
            <span className="text-sm text-ink-soft">Untuk memilih file lain, pilih ulang di atas lalu periksa lagi.</span>
          </form>
          {state?.message ? <FormMessage state={state} /> : null}
        </section>
      ) : null}
    </div>
  );
}
