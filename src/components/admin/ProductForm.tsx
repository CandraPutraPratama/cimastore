"use client";

import { useActionState } from "react";
import { saveProductAction } from "@/app/admin/actions";
import type { AdminProductDetail } from "@/core/admin/types";
import { formatRupiah } from "@/core/money/format";
import { input } from "./styles";
import { Field, FormMessage, TextInput } from "./ui";
import { SubmitButton } from "./SubmitButton";

export function ProductForm({
  slug,
  detail,
  categories,
  priceEditable,
}: {
  slug: string;
  detail: AdminProductDetail | null;
  categories: string[];
  priceEditable: boolean;
}) {
  const id = detail?.product.id ?? null;
  const [state, action] = useActionState(saveProductAction.bind(null, slug, id), undefined);
  const raw = state?.values ?? {};
  const val = (key: string, fallback: string) => String((Array.isArray(raw[key]) ? raw[key][0] : raw[key]) ?? fallback);
  const err = state?.errors ?? {};
  const p = detail?.product;

  const range =
    detail?.minPrice == null ? "belum ada harga" : detail.minPrice === detail.maxPrice ? formatRupiah(detail.minPrice) : `${formatRupiah(detail.minPrice)} sampai ${formatRupiah(detail.maxPrice ?? detail.minPrice)}`;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama produk" name="name" error={err.name}>
          <TextInput name="name" defaultValue={val("name", p?.name ?? "")} error={err.name} required maxLength={120} />
        </Field>
        <Field label="Kategori" name="category" error={err.category} hint="Pilih yang sudah ada atau ketik nama baru.">
          <TextInput name="category" list="kategori-daftar" defaultValue={val("category", p?.category ?? "")} error={err.category} required maxLength={60} />
          <datalist id="kategori-daftar">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      {priceEditable ? (
        <Field label="Harga (Rp)" name="price" error={err.price} hint="Berlaku di semua outlet brand ini.">
          <TextInput name="price" inputMode="numeric" defaultValue={val("price", detail?.minPrice != null ? String(detail.minPrice) : "")} error={err.price} required />
        </Field>
      ) : (
        <p className="rounded-xl bg-mist px-4 py-3 text-sm">
          Harga <span className="font-semibold">{range}</span>. Brand ini punya harga berbeda per outlet, jadi harga diubah lewat impor data brand, bukan dari sini.
        </p>
      )}

      <Field label="Deskripsi" name="description" error={err.description} hint="Opsional, maksimal 300 huruf.">
        <textarea id="description" name="description" rows={3} maxLength={300} defaultValue={val("description", p?.description ?? "")} className={input} />
      </Field>
      <Field label="Alamat foto" name="imageUrl" error={err.imageUrl} hint="Opsional. Alamat web foto (https://...).">
        <TextInput name="imageUrl" inputMode="url" defaultValue={val("imageUrl", p?.imageUrl ?? "")} error={err.imageUrl} maxLength={500} />
      </Field>

      <FormMessage state={state} />
      <SubmitButton>{id ? "Simpan perubahan" : "Tambah produk"}</SubmitButton>
    </form>
  );
}
