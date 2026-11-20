import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { card } from "@/components/admin/styles";
import { PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getBrand, getCatalogContext, getProduct } from "@/server/admin/data";

export const metadata: Metadata = { title: "Produk" };

export default async function ProductPage({ params }: PageProps<"/admin/brand/[slug]/menu/[id]">) {
  await requireAdmin();
  const { slug, id } = await params;
  const brand = await getBrand(slug);
  if (!brand) notFound();

  const isNew = id === "baru";
  const detail = isNew ? null : await getProduct(slug, id);
  if (!isNew && !detail) notFound();
  const ctx = await getCatalogContext(slug);
  if (!ctx) notFound();

  const multiPrice = ctx.priceListCodes.length > 1;
  const categories = detail ? detail.categories.map((c) => c.name) : ctx.categories.map((c) => c.name);

  return (
    <>
      <p className="mb-3">
        <Link href={`/admin/brand/${slug}/menu`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; Menu {brand.name}
        </Link>
      </p>
      <PageTitle title={isNew ? "Tambah produk" : (detail?.product.name ?? "Produk")} />
      {isNew && multiPrice ? (
        <p className={`${card} max-w-2xl text-sm`}>Brand ini punya harga berbeda per outlet. Produk baru ditambahkan lewat impor data brand, bukan dari sini.</p>
      ) : (
        <>
          <p className="mb-4 max-w-2xl text-sm text-ink-soft">Perubahan langsung tampil ke customer. Bila menu brand ini nanti diimpor ulang dari file data, nama dan harga mengikuti file tersebut.</p>
          <section className={`${card} max-w-2xl`}>
            <ProductForm slug={slug} detail={detail} categories={categories} priceEditable={detail ? detail.priceListCount <= 1 : !multiPrice} />
          </section>
        </>
      )}
    </>
  );
}
