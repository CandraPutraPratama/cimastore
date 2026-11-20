<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Jasdor v2 - Aturan untuk Agent

Website jasa order multi-brand (Kopi Kenangan, Fore, Chagee, Chatime, Mixue, McD).
**Baca `docs/ARCHITECTURE.md` sebelum mengerjakan apa pun.** Dokumen itu sumber kebenaran untuk model data, aturan harga/promo, dan tahapan bangun.

## Prinsip

- **Nambah brand = nambah data + konfigurasi, bukan ngubah kode inti.** Jangan pernah menulis `if (brand === "...")` di `src/core`, komponen, atau API route. Perbedaan antar brand harus berupa data (promo, fee, opsi, `outlet_mode`, `split_mode`) atau importer di `src/brands/<slug>/`.
- `src/core/` berisi logika bisnis murni (harga, promo, pemecahan transaksi, jam buka, pesan WhatsApp). Tidak boleh import Next.js, React, Supabase, `src/app`, `src/server`, `src/brands`, atau `src/components`. ESLint menegakkan aturan ini.
- Harga selalu dihitung ulang di server. Harga dari browser tidak dipercaya.
- Uang disimpan sebagai bilangan bulat rupiah. Jangan pakai desimal untuk nominal.
- Utamakan solusi paling sederhana yang menyelesaikan masalah. Jangan menambah abstraksi, konfigurasi, atau fitur yang tidak diminta.

## Bahasa dan istilah

- Teks untuk pengguna memakai Bahasa Indonesia.
- Selalu pakai istilah **"jasa order"** atau **"jasdor"**. Jangan pernah memakai "jastip".
- Jangan memakai karakter em dash (U+2014) di `src/`. Pakai tanda hubung biasa `-`.

## Data mentah

Folder `Chagee/`, `Chatime/`, `Fore/`, `Kopi Kenangan/` (dan nanti `Mixue/`, `McD/`) adalah data mentah milik pemilik. Jangan diubah, dipindah, atau di-commit. Importer membacanya lalu mengisi database.

## Sebelum menyatakan selesai

Jalankan dan pastikan semuanya lolos:

```bash
npm run check          # lint + typecheck + test
npm run build:worker   # build untuk Cloudflare Workers
```

Kode baru di `src/core` wajib punya test. Laporkan dengan jujur apa yang lolos, apa yang gagal, dan apa yang belum diverifikasi.
