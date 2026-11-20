import postgres from "postgres";
import { describeDatabaseUrl, loadEnvFiles, requireDatabaseUrl } from "./env";

/** Koneksi Postgres untuk skrip (migrasi & import). Bukan untuk kode website. */
export function connect(): { sql: postgres.Sql; target: string } {
  loadEnvFiles();
  const url = requireDatabaseUrl();
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const sql = postgres(url, {
    ssl: local ? false : "require",
    // Pooler Supabase mode transaksi tidak mendukung prepared statement.
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
    onnotice: () => {},
  });
  return { sql, target: describeDatabaseUrl(url) };
}
