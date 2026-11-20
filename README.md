# Jasdor v2

Website jasa order multi-brand: customer memilih brand, outlet, dan menu, membayar lewat QRIS, lalu pesanan diteruskan ke admin lewat WhatsApp. Customer mengambil pesanan sendiri di outlet.

Brand: Kopi Kenangan, Fore, Chagee, Chatime, Mixue, McD.

Arsitektur, model data, aturan promo, dan tahapan bangun ada di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Menjalankan di laptop

Butuh Node.js 22 atau lebih baru.

```bash
npm install
cp .env.example .env.local   # isi nilainya saat tahap yang membutuhkannya
npm run dev                  # buka http://localhost:3000
```

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development |
| `npm run check` | Lint + typecheck + test (wajib lolos sebelum commit) |
| `npm test` | Test saja (`npm run test:watch` untuk mode pantau) |
| `npm run build:worker` | Build untuk Cloudflare Workers |
| `npm run preview` | Build lalu jalankan versi Workers secara lokal |
| `npm run deploy` | Build lalu deploy ke Cloudflare |
| `npm run cf-typegen` | Perbarui tipe binding Cloudflare setelah mengubah `wrangler.jsonc` |

## Struktur folder

```text
src/app/          halaman dan API route (tipis, memanggil modul di bawah)
src/core/         logika bisnis murni: harga, promo, transaksi, jam buka, pesan WA
src/brands/       importer data per brand
src/server/       akses Supabase, R2, Telegram
supabase/         migrasi database
docs/             arsitektur dan runbook
```

Folder data mentah per brand (`Chagee/`, `Chatime/`, `Fore/`, `Kopi Kenangan/`) tidak masuk repo.

## Catatan

Jasdor adalah layanan independen dan tidak berafiliasi dengan brand mana pun. Nama dan logo brand dimiliki pemiliknya masing-masing.
