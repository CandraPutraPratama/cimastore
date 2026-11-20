"use client";

import { useActionState, useState } from "react";
import { saveBrandAction } from "@/app/admin/actions";
import type { AdminBrand } from "@/core/admin/types";
import { Field, FormMessage, Select, TextInput } from "./ui";
import { SubmitButton } from "./SubmitButton";

export function BrandForm({ brand }: { brand: AdminBrand }) {
  const [state, action] = useActionState(saveBrandAction.bind(null, brand.slug), undefined);
  const v = state?.values;
  const val = (key: string, fallback: string | number) => {
    const raw = v?.[key];
    return (Array.isArray(raw) ? raw[0] : raw) ?? fallback;
  };
  const err = state?.errors ?? {};

  const initialFeeType = brand.feeRules.type;
  const [feeType, setFeeType] = useState<string>(String(val("feeType", initialFeeType)));
  const fee = brand.feeRules;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama brand" name="name" error={err.name}>
          <TextInput name="name" defaultValue={val("name", brand.name)} error={err.name} required maxLength={60} />
        </Field>
        <Field label="Warna brand" name="accent" error={err.accent} hint="Dipakai untuk warna kotak brand di beranda dan garis warna di pesanan.">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pilih warna"
              defaultValue={String(val("accent", brand.theme.accent ?? "#f4a63a"))}
              onChange={(e) => {
                const text = e.currentTarget.form?.elements.namedItem("accent");
                if (text instanceof HTMLInputElement) text.value = e.currentTarget.value;
              }}
              className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border-2 border-ink bg-paper p-1"
            />
            <TextInput name="accent" defaultValue={String(val("accent", brand.theme.accent ?? "#f4a63a"))} error={err.accent} maxLength={7} className="field block min-h-11 font-mono" />
          </div>
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-xl border-2 border-dashed border-ink/40 p-4">
        <legend className="px-1 text-sm font-semibold">Biaya jasa</legend>
        <Field label="Cara menghitung" name="feeType" error={err.feeType}>
          <Select name="feeType" value={feeType} onChange={(e) => setFeeType(e.currentTarget.value)}>
            <option value="none">Tanpa biaya jasa</option>
            <option value="per_item">Per item (dikali jumlah item)</option>
            <option value="per_order">Per pesanan (sekali saja)</option>
          </Select>
        </Field>
        {feeType !== "none" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={feeType === "per_item" ? "Biaya per item (Rp)" : "Biaya per pesanan (Rp)"} name="feeAmount" error={err.feeAmount} hint="Isi 0 bila gratis.">
              <TextInput name="feeAmount" inputMode="numeric" defaultValue={val("feeAmount", fee.type === "none" ? "0" : fee.amount)} error={err.feeAmount} />
            </Field>
            {feeType === "per_item" ? (
              <Field label="Biaya bila hanya 1 item (Rp)" name="feeSingleAmount" error={err.feeSingleAmount} hint="Kosongkan bila sama dengan biaya per item.">
                <TextInput name="feeSingleAmount" inputMode="numeric" defaultValue={val("feeSingleAmount", fee.type === "per_item" ? (fee.singleItemAmount ?? "") : "")} error={err.feeSingleAmount} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pemecahan transaksi" name="splitMode" error={err.splitMode} hint="Otomatis: pesanan dipecah ke beberapa transaksi bila lebih hemat.">
          <Select name="splitMode" defaultValue={String(val("splitMode", brand.splitMode))}>
            <option value="auto">Otomatis</option>
            <option value="none">Satu transaksi saja</option>
          </Select>
        </Field>
        <Field label="Maksimal item per pesanan" name="maxItemsPerOrder" error={err.maxItemsPerOrder}>
          <TextInput name="maxItemsPerOrder" inputMode="numeric" defaultValue={val("maxItemsPerOrder", brand.maxItemsPerOrder)} error={err.maxItemsPerOrder} />
        </Field>
        <Field label="Urutan di beranda" name="sortOrder" error={err.sortOrder} hint="Angka kecil tampil lebih atas.">
          <TextInput name="sortOrder" inputMode="numeric" defaultValue={val("sortOrder", brand.sortOrder)} error={err.sortOrder} />
        </Field>
      </div>

      <FormMessage state={state} />
      <SubmitButton>Simpan pengaturan brand</SubmitButton>
    </form>
  );
}
