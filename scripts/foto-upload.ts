/**
 * Mengunggah foto produk satu brand ke Cloudflare R2 dan menautkannya ke produk.
 *
 *   npm run foto:upload chagee            unggah ke R2 sungguhan
 *   npm run foto:upload chagee periksa    hanya tampilkan pencocokan, tidak mengunggah
 *   npm run foto:upload chagee lokal      unggah ke R2 simulasi di komputermu (untuk npm run dev)
 *
 * Folder default: <folder data brand>/foto (contoh Chagee/foto). Folder lain boleh diberikan
 * sebagai argumen ketiga. Nama bucket dari R2_BUCKET (default jasdor-v2-foto).
 *
 * Aman diulang: foto yang isinya tidak berubah dilewati. Foto yang diganti mendapat alamat baru
 * (hash isi ada di kunci), jadi cache tidak menyajikan foto lama.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { matchPhotos, PHOTO_CONTENT_TYPE, photoExtension, photoKey, type PhotoProduct } from "../src/core/catalog/photos";
import { connect } from "./lib/db";
import { DEFAULT_RAW_DIRS } from "./lib/snapshot";

const WRANGLER = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");

function put(bucket: string, key: string, file: string, contentType: string, local: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [WRANGLER, "r2", "object", "put", `${bucket}/${key}`, "--file", file, "--content-type", contentType, local ? "--local" : "--remote"];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(output.trim().split("\n").slice(-6).join("\n") || `wrangler berhenti dengan kode ${code}`))));
  });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const brand = args.find((a) => !a.startsWith("-") && a !== "periksa" && a !== "lokal");
  const dryRun = args.includes("periksa") || args.includes("--dry-run") || process.env.npm_config_dry_run === "true";
  const local = args.includes("lokal") || args.includes("--local") || process.env.npm_config_local === "true";
  if (!brand) {
    console.error("Pemakaian: npm run foto:upload <brand> [periksa|lokal] [folder-foto]");
    process.exit(1);
  }
  const folderArg = args.filter((a) => !a.startsWith("-") && a !== brand && a !== "periksa" && a !== "lokal")[0];
  const folder = folderArg ?? (DEFAULT_RAW_DIRS[brand] ? path.join(DEFAULT_RAW_DIRS[brand], "foto") : undefined);
  if (!folder) {
    console.error(`Folder foto untuk "${brand}" tidak diketahui. Berikan sebagai argumen ketiga.`);
    process.exit(1);
  }
  const bucket = process.env.R2_BUCKET || "jasdor-v2-foto";

  const files = (await readdir(folder)).filter((f) => !f.startsWith("."));
  const { sql, target } = connect();
  try {
    console.log(`Database: ${target}`);
    console.log(`Folder: ${folder} (${files.length} berkas)`);
    const products = await sql<{ external_id: string; name: string; image_source_url: string | null; image_key: string | null }[]>`
      select p.external_id, p.name, p.image_source_url, p.image_key
      from public.products p join public.brands b on b.id = p.brand_id
      where b.slug = ${brand} and p.is_active`;
    if (products.length === 0) throw new Error(`Brand "${brand}" belum punya produk. Impor menunya dulu.`);

    const result = matchPhotos(
      files,
      products.map<PhotoProduct>((p) => ({ externalId: p.external_id, name: p.name, imageSourceUrl: p.image_source_url })),
    );
    const currentKey = new Map(products.map((p) => [p.external_id, p.image_key]));

    const jobs: Array<{ externalId: string; fileName: string; key: string; type: string }> = [];
    let unchanged = 0;
    for (const m of result.matched) {
      const bytes = await readFile(path.join(folder, m.fileName));
      const hash = createHash("sha256").update(bytes).digest("hex");
      const ext = photoExtension(m.fileName)!;
      const key = photoKey(brand, m.externalId, hash, ext);
      if (currentKey.get(m.externalId) === key) {
        unchanged++;
        continue;
      }
      jobs.push({ externalId: m.externalId, fileName: m.fileName, key, type: PHOTO_CONTENT_TYPE[ext === ("jpeg" as string) ? "jpg" : ext] });
    }

    console.log(`\nCocok: ${result.matched.length} foto (${result.matched.filter((m) => m.by === "kode").length} lewat kode, ${result.matched.filter((m) => m.by === "nama").length} lewat nama).`);
    console.log(`Perlu diunggah: ${jobs.length}. Sudah terunggah dan tidak berubah: ${unchanged}.`);
    for (const f of result.unmatchedFiles) console.log(`  ! tidak cocok produk mana pun: ${f}`);
    for (const a of result.ambiguous) console.log(`  ! lebih dari satu berkas untuk produk ${a.externalId}: ${a.fileNames.join(", ")}`);
    for (const n of result.productsWithoutPhoto) console.log(`  ! produk tanpa foto: ${n}`);
    if (dryRun) {
      console.log("\nMode periksa: tidak ada yang diunggah.");
      return;
    }
    if (jobs.length === 0) {
      console.log("\nTidak ada yang perlu diunggah.");
      return;
    }

    console.log(`\nMengunggah ke ${local ? "R2 simulasi lokal" : "R2"} (bucket ${bucket})...`);
    let done = 0;
    let failed = 0;
    const queue = [...jobs];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          // Sekali ulang otomatis: R2 simulasi lokal kadang sibuk bila banyak unggahan bersamaan.
          await put(bucket, job.key, path.join(folder, job.fileName), job.type, local).catch(async () => {
            await new Promise((r) => setTimeout(r, 1000));
            await put(bucket, job.key, path.join(folder, job.fileName), job.type, local);
          });
          await sql`
            update public.products set image_key = ${job.key}
            where external_id = ${job.externalId} and brand_id = (select id from public.brands where slug = ${brand})`;
          done++;
          console.log(`  ok ${done + failed}/${jobs.length} ${job.fileName}`);
        } catch (err) {
          failed++;
          console.error(`  GAGAL ${job.fileName}: ${err instanceof Error ? err.message : err}`);
        }
      }
    };
    await Promise.all(Array.from({ length: local ? 2 : 4 }, worker));
    console.log(`\nSelesai: ${done} foto terunggah dan tertaut${failed ? `, ${failed} gagal (jalankan lagi, yang sudah berhasil dilewati)` : ""}.`);
    if (failed) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(`GAGAL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
