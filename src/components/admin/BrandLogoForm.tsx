"use client";

import { useActionState } from "react";
import { saveBrandLogoAction } from "@/app/admin/actions";
import { BrandMark } from "@/components/BrandMark";
import { SubmitButton } from "./SubmitButton";
import { btn } from "./styles";

export function BrandLogoForm({ slug, name, accent, logoUrl }: { slug: string; name: string; accent?: string; logoUrl?: string | null }) {
  const [state, action] = useActionState(saveBrandLogoAction.bind(null, slug), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex items-center gap-4">
        <BrandMark name={name} logoUrl={logoUrl} accent={accent} />
        <div className="min-w-0 flex-1">
          <label htmlFor="logo" className="mb-1 block text-sm font-semibold">
            File logo
          </label>
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="field block w-full" />
          <p className="mt-1 text-xs text-ink-soft">PNG, JPG, atau WebP, maksimal 1 MB. Paling bagus berbentuk kotak.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>Simpan logo</SubmitButton>
        {logoUrl ? (
          <button type="submit" name="aksi" value="hapus" className={btn}>
            Hapus logo
          </button>
        ) : null}
        {state?.message ? (
          <p role="status" className={`text-sm font-semibold ${state.ok ? "text-hemat" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
