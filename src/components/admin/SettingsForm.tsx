"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/admin/actions";
import { DAY_NAMES } from "@/core/hours/schedule";
import type { SiteSettings } from "@/core/catalog/storefront";
import { Field, FormMessage, TextInput } from "./ui";
import { SubmitButton } from "./SubmitButton";
import { input } from "./styles";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function list(raw: string | string[] | undefined, fallback: number[]): Set<string> {
  if (raw === undefined) return new Set(fallback.map(String));
  return new Set(Array.isArray(raw) ? raw : [raw]);
}

export function SettingsForm({ settings, qrisMerchant }: { settings: SiteSettings; qrisMerchant: string | null }) {
  const [state, action] = useActionState(saveSettingsAction, undefined);
  const v = state?.values;
  const val = (key: string, fallback: string | number | null | undefined) => {
    const raw = v?.[key];
    return String((Array.isArray(raw) ? raw[0] : raw) ?? fallback ?? "");
  };
  const err = state?.errors ?? {};
  const open = list(v?.openDays, settings.openDays);
  const tentative = list(v?.tentativeDays, settings.tentativeDays);
  const emergency = v ? v.emergencyClosed === "on" : settings.emergencyClosed;
  const waDefault = settings.whatsappNumber.startsWith("62") ? `0${settings.whatsappNumber.slice(2)}` : settings.whatsappNumber;

  return (
    <form action={action} className="space-y-6">
      <fieldset className="space-y-3 rounded-xl border-2 border-dashed border-ink/40 p-4">
        <legend className="px-1 text-sm font-semibold">Jadwal layanan (semua brand)</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-1 font-medium">Hari</th>
                <th className="py-1 font-medium">Buka</th>
                <th className="py-1 font-medium">Tentatif</th>
              </tr>
            </thead>
            <tbody>
              {DAY_ORDER.map((d) => (
                <tr key={d} className="border-t border-line">
                  <td className="py-1">{DAY_NAMES[d]}</td>
                  <td>
                    <label className="flex min-h-11 items-center">
                      <input type="checkbox" name="openDays" value={d} defaultChecked={open.has(String(d))} aria-label={`${DAY_NAMES[d]} buka`} className="size-5 accent-ink" />
                    </label>
                  </td>
                  <td>
                    <label className="flex min-h-11 items-center">
                      <input type="checkbox" name="tentativeDays" value={d} defaultChecked={tentative.has(String(d))} aria-label={`${DAY_NAMES[d]} tentatif`} className="size-5 accent-ink" />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-soft">Tentatif = jasdor mungkin buka (ditandai di beranda). Hari yang dicentang Buka dan Tentatif dianggap Buka.</p>
        {err.openDays ? <p role="alert" className="text-sm font-medium text-danger">{err.openDays}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jam buka" name="openTime" error={err.openTime}>
            <TextInput name="openTime" type="time" defaultValue={val("openTime", settings.openTime)} error={err.openTime} required />
          </Field>
          <Field label="Jam tutup" name="closeTime" error={err.closeTime}>
            <TextInput name="closeTime" type="time" defaultValue={val("closeTime", settings.closeTime)} error={err.closeTime} required />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="emergencyClosed" defaultChecked={emergency} className="size-5 accent-ink" />
          <span className="text-sm">
            <span className="font-semibold">Tutup darurat.</span> Semua pemesanan ditolak sampai kotak ini dimatikan.
          </span>
        </label>
      </fieldset>

      <Field label="Pengumuman di beranda" name="announcement" error={err.announcement} hint="Kosongkan bila tidak ada. Maksimal 200 huruf.">
        <TextInput name="announcement" defaultValue={val("announcement", settings.announcement)} error={err.announcement} maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nomor WhatsApp admin" name="whatsappNumber" error={err.whatsappNumber} hint="Tujuan tombol Sudah bayar milik customer.">
          <TextInput name="whatsappNumber" inputMode="tel" defaultValue={val("whatsappNumber", waDefault)} error={err.whatsappNumber} required />
        </Field>
        <Field label="Batas waktu bayar (menit)" name="paymentExpiryMinutes" error={err.paymentExpiryMinutes} hint="Antara 5 dan 240 menit.">
          <TextInput name="paymentExpiryMinutes" inputMode="numeric" defaultValue={val("paymentExpiryMinutes", settings.paymentExpiryMinutes)} error={err.paymentExpiryMinutes} required />
        </Field>
      </div>

      <div>
        <label htmlFor="qrisPayload" className="mb-1 block text-sm font-semibold">
          QRIS statis baru
        </label>
        <textarea id="qrisPayload" name="qrisPayload" rows={3} defaultValue="" placeholder="Tempel teks QRIS (diawali 000201). Kosongkan bila tidak diganti." className={`${input} font-mono text-sm`} spellCheck={false} autoComplete="off" />
        <p className="mt-1 text-xs text-ink-soft">
          {qrisMerchant ? `QRIS sekarang atas nama ${qrisMerchant}. ` : "QRIS belum diatur atau tidak valid. "}
          Untuk menyalin teks dari gambar QRIS, pindai dengan aplikasi pembaca QR.
        </p>
        {err.qrisPayload ? <p role="alert" className="mt-1 text-sm font-medium text-danger">{err.qrisPayload}</p> : null}
      </div>

      <FormMessage state={state} />
      <SubmitButton>Simpan pengaturan</SubmitButton>
    </form>
  );
}
