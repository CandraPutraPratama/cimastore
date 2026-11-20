import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromoForm } from "@/components/admin/PromoForm";
import { card } from "@/components/admin/styles";
import { PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";
import { getBrand, getSettings, listProducts } from "@/server/admin/data";

export const metadata: Metadata = { title: "Promo" };

/** id = "baru" untuk promo baru, selain itu id promo yang diubah. */
export default async function PromoPage({ params }: PageProps<"/admin/brand/[slug]/promo/[id]">) {
  await requireAdmin();
  const { slug, id } = await params;
  const [brand, products, settings] = await Promise.all([getBrand(slug), listProducts(slug), getSettings()]);
  if (!brand) notFound();
  const promo = id === "baru" ? null : (brand.promos.find((p) => p.id === id) ?? null);
  if (id !== "baru" && !promo) notFound();

  return (
    <>
      <p className="mb-3">
        <Link href={`/admin/brand/${slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; {brand.name}
        </Link>
      </p>
      <PageTitle title={promo ? "Ubah promo" : "Tambah promo"} />
      <section className={card}>
        <PromoForm slug={slug} promo={promo} products={products.filter((p) => p.isActive)} timeZone={settings.timeZone} />
      </section>
    </>
  );
}
