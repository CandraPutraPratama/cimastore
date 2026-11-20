"use client";

import { useActionState } from "react";
import { createBrandAction } from "@/app/admin/actions";
import { Field, FormMessage, Select, TextInput } from "./ui";
import { SubmitButton } from "./SubmitButton";

export function BrandCreateForm() {
  const [state, action] = useActionState(createBrandAction, undefined);
  const raw = state?.values ?? {};
  const val = (key: string, fallback = "") => String((Array.isArray(raw[key]) ? raw[key][0] : raw[key]) ?? fallback);
  const err = state?.errors ?? {};

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama brand" name="name" error={err.name}>
          <TextInput name="name" defaultValue={val("name")} error={err.name} required maxLength={60} placeholder="Janji Jiwa" />
        </Field>
        <Field label="Alamat di website" name="slug" error={err.slug} hint="Kosongkan untuk dibuat otomatis dari nama. Contoh: jasdor.cimagroup.my.id/janji-jiwa">
          <TextInput name="slug" defaultValue={val("slug")} error={err.slug} maxLength={40} placeholder="janji-jiwa" />
        </Field>
        <Field label="Kode pesanan" name="prefix" error={err.prefix} hint="2 atau 3 huruf, awalan nomor pesanan (JJ-7F3K9Q). Tidak bisa sama dengan brand lain.">
          <TextInput name="prefix" defaultValue={val("prefix")} error={err.prefix} required maxLength={3} placeholder="JJ" autoCapitalize="characters" />
        </Field>
        <Field label="Warna brand" name="accent" error={err.accent} hint="Format #RRGGBB.">
          <TextInput name="accent" defaultValue={val("accent", "#444444")} error={err.accent} maxLength={7} />
        </Field>
      </div>
      <Field label="Outlet" name="outletMode" error={err.outletMode} hint="Pilih kedua bila brand ini tidak punya daftar outlet yang kamu pegang (seperti McD).">
        <Select name="outletMode" defaultValue={val("outletMode", "catalog")}>
          <option value="catalog">Customer memilih dari daftar outlet</option>
          <option value="customer_input">Customer mengetik sendiri outletnya</option>
        </Select>
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending="Membuat...">Buat brand</SubmitButton>
    </form>
  );
}
