/**
 * Mengunggah logo brand ke Cloudflare R2 dan menautkannya ke brand.
 *
 *   npm run logo:upload                 unggah semua logo di folder logo/ ke R2 sungguhan
 *   npm run logo:upload periksa         hanya tampilkan pencocokan
 *   npm run logo:upload lokal           ke R2 simulasi di komputermu (untuk npm run dev)
 *   npm run logo:upload -- D:\jalur     folder lain
 *
 * Nama berkas = slug brand: kopi-kenangan.png, fore.webp, chagee.jpg, chatime.png, mixue.png, mcd.png.
 * Spasi dan huruf besar ditoleransi ("Kopi Kenangan.png"). Format dikenali dari isi berkas.
 * R2 sungguhan dan R2 simulasi terpisah, sedangkan alamat logo di database dipakai bersama:
 * unggah ke R2 sungguhan agar situs online menampilkannya.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { detectLogoType, logoKey, MAX_LOGO_BYTES } from "../src/core/catalog/logo";
import { PHOTO_CONTENT_TYPE } from "../src/core/catalog/photos";
import { connect } from "./lib/db";

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

const toSlug = (fileName: string) =>
  path.parse(fileName).name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const dryRun = args.includes("periksa") || process.env.npm_config_dry_run === "true";
  const local = args.includes("lokal") || process.env.npm_config_local === "true";
  const folder = args.find((a) => !a.startsWith("-") && a !== "periksa" && a !== "lokal") ?? "logo";
  const bucket = process.env.R2_BUCKET || "jasdor-v2-foto";

  const files = (await readdir(folder)).filter((f) => !f.startsWith("."));
  const { sql, target } = connect();
  try {
    console.log(`Database: ${target}`);
    console.log(`Folder: ${folder} (${files.length} berkas)`);
    const brands = new Set((await sql<{ slug: string }[]>`select slug from public.brands`).map((b) => b.slug));

    const jobs: Array<{ slug: string; fileName: string; key: string; type: string }> = [];
    const seen = new Set<string>();
    for (const fileName of files) {
      const slug = toSlug(fileName);
      if (!brands.has(slug)) {
        console.log(`  ! ${fileName}: tidak ada brand dengan slug "${slug}" (brand: ${[...brands].join(", ")})`);
        continue;
      }
      if (seen.has(slug)) {
        console.log(`  ! ${fileName}: brand ${slug} sudah punya berkas logo lain, dilewati`);
        continue;
      }
      const bytes = await readFile(path.join(folder, fileName));
      if (bytes.length > MAX_LOGO_BYTES) {
        console.log(`  ! ${fileName}: ${(bytes.length / 1e6).toFixed(1)} MB, maksimal 1 MB. Kecilkan dulu.`);
        continue;
      }
      const ext = detectLogoType(new Uint8Array(bytes));
      if (!ext) {
        console.log(`  ! ${fileName}: bukan PNG, JPG, atau WebP`);
        continue;
      }
      seen.add(slug);
      const hash = createHash("sha256").update(bytes).digest("hex");
      jobs.push({ slug, fileName, key: logoKey(slug, hash, ext), type: PHOTO_CONTENT_TYPE[ext] });
    }
    for (const b of brands) if (!seen.has(b)) console.log(`  - belum ada logo untuk: ${b}`);

    console.log(`\nAkan diunggah: ${jobs.length} logo.`);
    for (const j of jobs) console.log(`  ${j.slug} <- ${j.fileName} (${j.key})`);
    if (dryRun || jobs.length === 0) {
      console.log(dryRun ? "\nMode periksa: tidak ada yang diunggah." : "\nTidak ada logo untuk diunggah.");
      return;
    }

    console.log(`\nMengunggah ke ${local ? "R2 simulasi lokal" : "R2"} (bucket ${bucket})...`);
    let failed = 0;
    for (const job of jobs) {
      try {
        await put(bucket, job.key, path.join(folder, job.fileName), job.type, local);
        await sql`update public.brands set logo_url = ${`/foto/${job.key}`} where slug = ${job.slug}`;
        console.log(`  ok ${job.slug}`);
      } catch (err) {
        failed++;
        console.error(`  GAGAL ${job.slug}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`\nSelesai: ${jobs.length - failed} logo terunggah dan tertaut${failed ? `, ${failed} gagal (jalankan lagi)` : ""}.`);
    if (failed) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(`GAGAL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
