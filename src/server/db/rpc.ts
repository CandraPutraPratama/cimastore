import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Memanggil fungsi database (RPC). Dua jalur dengan fungsi SQL yang sama:
 * - Produksi & laptop pemilik: API Supabase (SUPABASE_URL + SUPABASE_SECRET_KEY).
 * - Development tanpa akses API Supabase: koneksi Postgres langsung (DATABASE_URL),
 *   hanya bila SUPABASE_URL tidak diisi.
 * Hanya untuk kode server. Secret key tidak pernah dikirim ke browser.
 */

export class DatabaseConfigError extends Error {}

let supabase: SupabaseClient | null = null;

function clean(value: string | undefined): string | undefined {
  const v = value?.replace(/\r/g, "").trim();
  return v ? v : undefined;
}

/** "https://xxx.supabase.co/rest/v1/" -> "https://xxx.supabase.co" */
export function normalizeSupabaseUrl(url: string): string {
  return new URL(url).origin;
}

function supabaseClient(url: string, key: string): SupabaseClient {
  supabase ??= createClient(normalizeSupabaseUrl(url), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabase;
}

async function viaPostgres<T>(databaseUrl: string, fn: string, args: Record<string, unknown>): Promise<T | null> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 2, onnotice: () => {} });
  try {
    const names = Object.keys(args);
    if (!/^[a-z_]+$/.test(fn) || names.some((n) => !/^p_[a-z_]+$/.test(n))) throw new Error("Nama fungsi/argumen tidak valid");
    const call = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
    const values = names.map((n) => args[n]) as never[];
    const rows = await sql.unsafe(`select public.${fn}(${call}) as result`, values);
    return (rows[0]?.result ?? null) as T | null;
  } finally {
    await sql.end();
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SECRET_KEY);
  if (url && key) {
    const { data, error } = await supabaseClient(url, key).rpc(fn, args);
    if (error) throw new Error(`Database (${fn}): ${error.message}`);
    return (data ?? null) as T | null;
  }
  const databaseUrl = clean(process.env.DATABASE_URL);
  if (databaseUrl && process.env.NODE_ENV !== "production") return viaPostgres<T>(databaseUrl, fn, args);
  throw new DatabaseConfigError("SUPABASE_URL dan SUPABASE_SECRET_KEY belum diisi.");
}
