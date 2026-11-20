"use client";

import { useActionState, useMemo, useState } from "react";
import { savePromoAction } from "@/app/admin/actions";
import type { AdminPromo, AdminProduct } from "@/core/admin/types";
import { isoToLocalInput } from "@/core/admin/datetime";
import { Field, FormMessage, Select, TextInput } from "./ui";
import { SubmitButton } from "./SubmitButton";
import { input } from "./styles";

export function PromoForm({
  slug,
  promo,
  products,
  timeZone,
}: {
  slug: string;
  promo: AdminPromo | null;
  products: AdminProduct[];
  timeZone: string;
}) {
  const [state, action] = useActionState(savePromoAction.bind(null, slug), undefined);
  const v = state?.values;
  const val = (key: string, fallback: string | number | null | undefined) => {
    const raw = v?.[key];
    return String((Array.isArray(raw) ? raw[0] : raw) ?? fallback ?? "");
  };
  const err = state?.errors ?? {};

  const [level, setLevel] = useState(val("level", promo?.level ?? "transaction"));
  const [type, setType] = useState(val("type", promo?.type ?? "percent"));
  const [filter, setFilter] = useState("");

  const selected = useMemo(() => {
    const raw = v?.productIds;
    if (raw !== undefined) return new Set(Array.isArray(raw) ? raw : [raw]);
    return new Set(promo?.productIds ?? []);
  }, [v, promo]);

  const shown = products.filter((p) => !filter || `${p.name} ${p.category}`.toLowerCase().includes(filter.toLowerCase()));
  const activeDefault = v ? v.active === "on" : (promo?.active ?? true);

  return (
    <form action={action} className="space-y-5">
      {promo ? <input type="hidden" name="id" value={promo.id} /> : null}

      <Field label="Nama promo" name="name" error={err.name} hint="Nama ini tampil ke customer di keranjang dan di beranda.">
        <TextInput name="name" defaultValue={val("name", promo?.name)} error={err.name} required maxLength={80} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Jenis promo"
          name="level"
          error={err.level}
          hint={level === "item" ? "Berlaku untuk produk tertentu dan bisa digabung dengan voucher." : "Voucher di app brand: satu voucher untuk satu transaksi."}
        >
          <Select name="level" value={level} onChange={(e) => setLevel(e.currentTarget.value)}>
            <option value="transaction">Voucher per transaksi</option>
            <option value="item">Promo khusus produk</option>
          </Select>
        </Field>
        <Field label="Cakupan potongan" name="scope" error={err.scope} hint="Item termurah: contoh item kedua 50%.">
          <Select name="scope" defaultValue={val("scope", promo?.scope ?? "all_items")}>
            <option value="all_items">Semua item di transaksi</option>
            <option value="cheapest_item">Hanya 1 item termurah</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Potongan berupa" name="type" error={err.type}>
          <Select name="type" value={type} onChange={(e) => setType(e.currentTarget.value)}>
            <option value="percent">Persen (%)</option>
            <option value="fixed">Rupiah (Rp)</option>
          </Select>
        </Field>
        <Field label={type === "percent" ? "Besar potongan (%)" : "Besar potongan (Rp)"} name="value" error={err.value}>
          <TextInput name="value" inputMode="numeric" defaultValue={val("value", promo?.value)} error={err.value} required />
        </Field>
        <Field label="Dihitung dari" name="appliesTo" error={err.appliesTo} hint="Pilih harga dasar bila tambahan opsi (topping, ukuran) tidak ikut didiskon.">
          <Select name="appliesTo" defaultValue={val("appliesTo", promo?.appliesTo ?? "subtotal")}>
            <option value="subtotal">Harga termasuk tambahan opsi</option>
            <option value="base_price">Harga dasar menu saja</option>
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-xl border-2 border-dashed border-ink/40 p-4">
        <legend className="px-1 text-sm font-semibold">Syarat dan batas (kosongkan bila tidak ada)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Potongan maksimal (Rp)" name="maxDiscount" error={err.maxDiscount} hint={level === "item" ? "Per porsi." : "Per transaksi."}>
            <TextInput name="maxDiscount" inputMode="numeric" defaultValue={val("maxDiscount", promo?.maxDiscount)} error={err.maxDiscount} />
          </Field>
          <Field label="Minimal belanja (Rp)" name="minSubtotal" error={err.minSubtotal} hint="Dalam satu transaksi.">
            <TextInput name="minSubtotal" inputMode="numeric" defaultValue={val("minSubtotal", promo?.minSubtotal)} error={err.minSubtotal} />
          </Field>
          <Field label="Minimal jumlah item" name="minQty" error={err.minQty}>
            <TextInput name="minQty" inputMode="numeric" defaultValue={val("minQty", promo?.minQty)} error={err.minQty} />
          </Field>
          <Field label="Maksimal jumlah item" name="maxQty" error={err.maxQty} hint="Contoh: voucher 30% hanya untuk transaksi 1 item.">
            <TextInput name="maxQty" inputMode="numeric" defaultValue={val("maxQty", promo?.maxQty)} error={err.maxQty} />
          </Field>
          <Field label="Boleh dipakai berapa kali per pesanan" name="maxUsesPerOrder" error={err.maxUsesPerOrder}>
            <TextInput name="maxUsesPerOrder" inputMode="numeric" defaultValue={val("maxUsesPerOrder", promo?.maxUsesPerOrder)} error={err.maxUsesPerOrder} />
          </Field>
          {level === "item" ? (
            <Field label="Maksimal porsi per pesanan" name="maxUnits" error={err.maxUnits} hint="Contoh: Boba Sundae hanya 1 porsi.">
              <TextInput name="maxUnits" inputMode="numeric" defaultValue={val("maxUnits", promo?.maxUnits)} error={err.maxUnits} />
            </Field>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border-2 border-dashed border-ink/40 p-4" aria-describedby="produk-hint">
        <legend className="px-1 text-sm font-semibold">{level === "item" ? "Produk yang dapat promo (wajib pilih)" : "Batasi ke produk tertentu (kosong = semua produk)"}</legend>
        {products.length === 0 ? (
          <p className="text-sm text-ink-soft">Brand ini belum punya produk. Import menu dulu untuk memilih produk.</p>
        ) : (
          <>
            <input type="search" placeholder="Cari produk" value={filter} onChange={(e) => setFilter(e.currentTarget.value)} className={`${input} mb-2`} aria-label="Cari produk" />
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                    <input type="checkbox" name="productIds" value={p.externalId} defaultChecked={selected.has(p.externalId)} className="size-4 accent-ink" />
                    <span className="min-w-0 flex-1 text-sm">
                      {p.name} <span className="text-ink-faint">· {p.category}</span>
                    </span>
                  </label>
                </li>
              ))}
              {shown.length === 0 ? <li className="px-3 py-3 text-sm text-ink-soft">Tidak ada produk yang cocok.</li> : null}
            </ul>
            <p id="produk-hint" className="mt-1 text-xs text-ink-soft">
              Produk yang tersaring tetap tercentang. Hanya yang tercentang yang disimpan.
            </p>
          </>
        )}
        {err.productIds ? (
          <p role="alert" className="mt-1 text-sm font-medium text-danger">
            {err.productIds}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mulai berlaku (WIB)" name="startsAt" error={err.startsAt} hint="Kosong = langsung.">
          <TextInput name="startsAt" type="datetime-local" defaultValue={v ? val("startsAt", "") : isoToLocalInput(promo?.startsAt, timeZone)} error={err.startsAt} />
        </Field>
        <Field label="Berakhir (WIB)" name="endsAt" error={err.endsAt} hint="Kosong = tanpa batas waktu.">
          <TextInput name="endsAt" type="datetime-local" defaultValue={v ? val("endsAt", "") : isoToLocalInput(promo?.endsAt, timeZone)} error={err.endsAt} />
        </Field>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={activeDefault} className="size-5 accent-ink" />
        <span className="text-sm font-semibold">Promo aktif</span>
      </label>

      <FormMessage state={state} />
      <SubmitButton>{promo ? "Simpan perubahan" : "Tambah promo"}</SubmitButton>
    </form>
  );
}
