import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Membaca .env.local lalu .env (nilai yang sudah ada di environment tidak ditimpa).
 * Tahan terhadap akhir baris Windows (CRLF), spasi, dan tanda kutip.
 */
export function loadEnvFiles(cwd = process.cwd()): void {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(cwd, name);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.replace(/\r/g, "").trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

const DATABASE_URL_HELP = `DATABASE_URL belum diisi di .env.local.
Ambil dari dashboard Supabase: tombol "Connect" > bagian "Session pooler" > salin connection string,
lalu ganti [YOUR-PASSWORD] dengan password database project.`;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error(DATABASE_URL_HELP);
  if (url.includes("[YOUR-PASSWORD]")) {
    throw new Error("DATABASE_URL masih berisi [YOUR-PASSWORD]. Ganti dengan password database project Supabase.");
  }
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL harus diawali postgresql://");
  return url;
}

/** Host database tanpa password, untuk ditampilkan di log. */
export function describeDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(URL tidak terbaca)";
  }
}
