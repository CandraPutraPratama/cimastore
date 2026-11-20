import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutletPicker } from "@/components/storefront/OutletPicker";
import { getOutlets } from "@/server/catalog";

export async function generateMetadata({ params }: PageProps<"/[brand]">): Promise<Metadata> {
  const { brand } = await params;
  const data = await getOutlets(brand, { limit: 1 });
  return { title: data ? `Pilih outlet ${data.brand.name}` : "Brand tidak ditemukan" };
}

export default async function BrandPage({ params }: PageProps<"/[brand]">) {
  const { brand } = await params;
  const data = await getOutlets(brand);
  if (!data) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-5 pt-5 pb-4">
        <Link href="/" className="text-sm font-semibold text-ink-soft hover:text-ink">
          Ganti brand
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden className="h-8 w-1.5 rounded-full" style={{ background: data.brand.theme.accent ?? "var(--color-ink)" }} />
          <h1 className="text-2xl font-extrabold tracking-tight">{data.brand.name}</h1>
        </div>
        <p className="mt-1 text-ink-soft">Pilih outlet tempat kamu mengambil pesanan.</p>
      </header>
      <OutletPicker brand={data.brand.slug} initial={data} />
    </main>
  );
}
