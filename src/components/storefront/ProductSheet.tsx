"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { defaultOptionIds } from "@/core/catalog/resolve";
import { priceLine } from "@/core/catalog/selection";
import type { ResolvedProduct } from "@/core/catalog/types";
import { formatRupiah } from "@/core/money/format";
import { ProductImage } from "./ProductImage";

interface Props {
  product: ResolvedProduct;
  imageUrl?: string;
  description?: string;
  maxQuantity: number;
  onAdd: (selection: { optionIds: string[]; quantity: number; note?: string }) => void;
  onClose: () => void;
}

/** Buang opsi yang syaratnya tidak lagi terpenuhi (misal topping Large saat ganti ke Regular). */
function dropUnmet(product: ResolvedProduct, chosen: Set<string>): Set<string> {
  const next = new Set(chosen);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of product.optionGroups) {
      for (const option of group.options) {
        if (next.has(option.id) && option.requiresAnyOf && !option.requiresAnyOf.some((r) => next.has(r))) {
          next.delete(option.id);
          changed = true;
        }
      }
    }
  }
  return next;
}

export function ProductSheet({ product, imageUrl, description, maxQuantity, onAdd, onClose }: Props) {
  const [chosen, setChosen] = useState(() => new Set(defaultOptionIds(product)));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  const result = useMemo(
    () => priceLine(product, { productId: product.id, quantity, optionIds: [...chosen], note }),
    [product, quantity, chosen, note],
  );
  const errorsByGroup = new Map(
    (result.ok ? [] : result.errors).filter((e) => e.groupId).map((e) => [e.groupId!, e.message]),
  );
  const unitPrice = result.ok
    ? result.line.unitPrice
    : product.basePrice + product.optionGroups.flatMap((g) => g.options).filter((o) => chosen.has(o.id)).reduce((s, o) => s + o.priceDelta, 0);

  function toggle(groupIndex: number, optionId: string) {
    const group = product.optionGroups[groupIndex];
    setChosen((current) => {
      const next = new Set(current);
      if (group.selection === "single") {
        for (const o of group.options) next.delete(o.id);
        if (!(group.min === 0 && current.has(optionId))) next.add(optionId);
      } else if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return dropUnmet(product, next);
    });
  }

  function submit() {
    if (!result.ok) {
      setShowErrors(true);
      return;
    }
    onAdd({ optionIds: result.line.options.map((o) => o.id), quantity, ...(note.trim() ? { note: note.trim() } : {}) });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-produk"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-paper focus:outline-none"
      >
        <div className="overflow-y-auto overscroll-contain">
          <div className={imageUrl ? "relative" : "relative h-14"}>
            {imageUrl ? <ProductImage src={imageUrl} name={product.name} className="aspect-[4/3] w-full" /> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-paper/95 text-xl font-semibold shadow"
            >
              ×
            </button>
          </div>
          <div className="px-5 pt-4 pb-2">
            <h2 id="judul-produk" className="text-xl font-bold">
              {product.name}
            </h2>
            {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
            <p className="price mt-2 text-lg font-semibold">{formatRupiah(product.basePrice)}</p>
          </div>

          {product.optionGroups.map((group, gi) => {
            const visible = group.options.filter((o) => !o.requiresAnyOf || o.requiresAnyOf.some((r) => chosen.has(r)));
            if (visible.length === 0) return null;
            const count = group.options.filter((o) => chosen.has(o.id)).length;
            const full = group.selection === "multiple" && group.max !== null && count >= group.max;
            const rule =
              group.selection === "single"
                ? group.min > 0
                  ? "Wajib pilih 1"
                  : "Opsional"
                : group.max !== null
                  ? `Opsional, maksimal ${group.max}`
                  : "Opsional, boleh lebih dari satu";
            const error = showErrors ? errorsByGroup.get(group.id) : undefined;
            return (
              <fieldset key={group.id} className="border-t border-line px-5 py-4">
                <legend className="sr-only">{group.name}</legend>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold" aria-hidden>
                    {group.name}
                  </p>
                  <p className={`text-xs ${error ? "font-semibold text-danger" : "text-ink-faint"}`}>{error ?? rule}</p>
                </div>
                <div className="mt-2">
                  {visible.map((option) => {
                    const checked = chosen.has(option.id);
                    const disabled = !checked && full;
                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center gap-3 py-2 ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        <input
                          type={group.selection === "single" ? "radio" : "checkbox"}
                          name={group.id}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(gi, option.id)}
                          className="size-5 accent-[var(--color-ink)]"
                        />
                        <span className="flex-1">{option.name}</span>
                        {option.priceDelta > 0 ? (
                          <span className="price text-sm text-ink-soft">+{formatRupiah(option.priceDelta)}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div className="border-t border-line px-5 py-4">
            <label htmlFor="catatan" className="font-semibold">
              Catatan <span className="font-normal text-ink-faint">(opsional)</span>
            </label>
            <textarea
              id="catatan"
              rows={2}
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: gulanya dipisah"
              className="mt-2 w-full resize-none rounded-xl border border-line bg-mist px-3 py-2 text-base placeholder:text-ink-faint focus:border-ink focus:bg-paper focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-paper px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center rounded-full border border-line">
            <button
              type="button"
              aria-label="Kurangi jumlah"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="grid size-10 place-items-center text-xl font-semibold disabled:opacity-30"
            >
              −
            </button>
            <span className="price w-6 text-center font-semibold" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Tambah jumlah"
              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
              disabled={quantity >= maxQuantity}
              className="grid size-10 place-items-center text-xl font-semibold disabled:opacity-30"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={maxQuantity < 1}
            className="flex flex-1 items-center justify-between gap-3 rounded-full bg-ink px-5 py-3 font-semibold text-paper disabled:opacity-40"
          >
            <span>{maxQuantity < 1 ? "Pesanan sudah penuh" : "Tambah"}</span>
            <span className="price">{formatRupiah(unitPrice * quantity)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
