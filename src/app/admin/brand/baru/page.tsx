import type { Metadata } from "next";
import Link from "next/link";
import { BrandCreateForm } from "@/components/admin/BrandCreateForm";
import { card } from "@/components/admin/styles";
import { PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin/auth";

export const metadata: Metadata = { title: "Tambah brand" };

export default async function NewBrandPage() {
  await requireAdmin();
  return (
    <>
      <p className="mb-3">
        <Link href="/admin/brand" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          &larr; Semua brand
        </Link>
      </p>
      <PageTitle title="Tambah brand" />
      <p className="mb-4 text-sm text-ink-soft">Brand baru dibuat nonaktif. Setelah menu dan biaya jasanya siap, aktifkan dari daftar brand.</p>
      <section className={`${card} max-w-2xl`}>
        <BrandCreateForm />
      </section>
    </>
  );
}
