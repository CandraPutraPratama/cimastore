"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Satu baris keranjang: pilihan customer, harga selalu dihitung ulang dari menu terbaru. */
export interface CartItem {
  key: string;
  productId: string;
  optionIds: string[];
  quantity: number;
  note?: string;
}

const VERSION = 1;
const EMPTY: CartItem[] = [];
const cache = new Map<string, CartItem[]>();
const listeners = new Set<() => void>();

export function cartItemKey(productId: string, optionIds: string[], note?: string): string {
  return [productId, [...optionIds].sort().join("+"), note?.trim() ?? ""].join("|");
}

function read(storageKey: string): CartItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { v?: number; items?: CartItem[] };
    return parsed.v === VERSION && Array.isArray(parsed.items) ? parsed.items : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getItems(storageKey: string): CartItem[] {
  if (!cache.has(storageKey)) cache.set(storageKey, read(storageKey));
  return cache.get(storageKey)!;
}

function setItems(storageKey: string, items: CartItem[]) {
  cache.set(storageKey, items);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ v: VERSION, items }));
  } catch {
    // Penyimpanan browser penuh atau diblokir: keranjang tetap jalan selama halaman terbuka.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Sinkron dengan tab lain yang membuka outlet yang sama.
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("jasdor:cart:")) {
      cache.delete(e.key);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const noSubscribe = () => () => {};

/** Keranjang per brand + outlet, disimpan di browser customer. */
export function useCart(brand: string, outlet: string) {
  const storageKey = `jasdor:cart:${brand}:${outlet}`;
  const items = useSyncExternalStore(
    subscribe,
    () => getItems(storageKey),
    () => EMPTY,
  );
  // false saat render di server, true setelah halaman aktif di browser.
  const ready = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  const update = useCallback(
    (fn: (current: CartItem[]) => CartItem[]) => setItems(storageKey, fn(getItems(storageKey)).filter((i) => i.quantity > 0)),
    [storageKey],
  );

  const add = useCallback(
    (item: Omit<CartItem, "key">) =>
      update((current) => {
        const key = cartItemKey(item.productId, item.optionIds, item.note);
        const existing = current.find((i) => i.key === key);
        return existing
          ? current.map((i) => (i.key === key ? { ...i, quantity: i.quantity + item.quantity } : i))
          : [...current, { ...item, key }];
      }),
    [update],
  );

  const setQuantity = useCallback(
    (key: string, quantity: number) => update((current) => current.map((i) => (i.key === key ? { ...i, quantity } : i))),
    [update],
  );

  const clear = useCallback(() => update(() => []), [update]);

  return { items, ready, add, setQuantity, clear };
}
