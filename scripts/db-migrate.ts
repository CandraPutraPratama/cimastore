/**
 * Membuat / memperbarui tabel database lalu mengisi data awal (brand, promo, pengaturan).
 *
 *   npm run db:migrate
 *
 * Migrasi di supabase/migrations dijalankan berurutan, masing-masing sekali saja
 * (dicatat di tabel schema_migrations). supabase/seed.sql aman dijalankan berulang.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./lib/db";

async function main() {
  const { sql, target } = connect();
  console.log(`Database: ${target}`);
  try {
    await sql.unsafe(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
      alter table public.schema_migrations enable row level security;
    `);
    const applied = new Set((await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));

    const dir = path.join("supabase", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  = ${file} (sudah)`);
        continue;
      }
      const content = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into public.schema_migrations (name) values (${file})`;
      });
      console.log(`  + ${file}`);
    }

    await sql.unsafe(await readFile(path.join("supabase", "seed.sql"), "utf8"));
    const brands = await sql<{ slug: string; is_active: boolean; promos: number }[]>`
      select b.slug, b.is_active, count(p.id)::int as promos
      from public.brands b left join public.promos p on p.brand_id = b.id
      group by b.slug, b.is_active, b.sort_order order by b.sort_order`;
    console.log("Data awal:");
    for (const b of brands) console.log(`  ${b.slug}: ${b.promos} promo, ${b.is_active ? "aktif" : "nonaktif"}`);
    console.log("Selesai.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(`GAGAL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
