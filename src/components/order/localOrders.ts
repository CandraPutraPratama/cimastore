"use client";

/**
 * Yang diingat browser customer (tidak dikirim ke mana pun):
 * - nama & nomor WA terakhir, supaya checkout berikutnya tidak perlu mengetik ulang;
 * - link pesanan terakhir, supaya halaman bayar bisa dibuka lagi kalau tab tertutup.
 */

const CUSTOMER_KEY = "jasdor:customer";
const ORDERS_KEY = "jasdor:orders";
const MAX_ORDERS = 8;

export interface SavedCustomer {
  name: string;
  whatsapp: string;
}

export interface SavedOrder {
  id: string;
  path: string;
  brandName: string;
  outletName: string;
  total: number;
  createdAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan diblokir: fitur ingat-ingat dilewati.
  }
}

export function loadCustomer(): SavedCustomer | null {
  const c = read<SavedCustomer | null>(CUSTOMER_KEY, null);
  return c && typeof c.name === "string" && typeof c.whatsapp === "string" ? c : null;
}

let cachedCustomer: SavedCustomer | null | undefined;

/** Untuk useSyncExternalStore: nilai yang sama di setiap panggilan selama halaman terbuka. */
export function customerSnapshot(): SavedCustomer | null {
  if (cachedCustomer === undefined) cachedCustomer = loadCustomer();
  return cachedCustomer;
}

export function saveCustomer(customer: SavedCustomer) {
  cachedCustomer = customer;
  write(CUSTOMER_KEY, customer);
}

export function loadOrders(): SavedOrder[] {
  const list = read<SavedOrder[]>(ORDERS_KEY, []);
  return Array.isArray(list) ? list.filter((o) => o && typeof o.path === "string" && o.path.startsWith("/pesanan/")) : [];
}

export function rememberOrder(order: SavedOrder) {
  write(ORDERS_KEY, [order, ...loadOrders().filter((o) => o.id !== order.id)].slice(0, MAX_ORDERS));
}
