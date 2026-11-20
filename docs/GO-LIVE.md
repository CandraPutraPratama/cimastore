# Panduan go-live (Tahap 6)

Urutan dari nol sampai website jalan di subdomain uji. Semua perintah dijalankan di laptop, di folder `jasdor-v2`.
Jangan menulis password atau secret di chat, kode, atau commit.

## 1. Database
1. Pastikan `DATABASE_URL` (Session pooler Supabase, project `db-cimastore`) ada di `.env.local`.
2. `npm run db:migrate` menerapkan semua migrasi, termasuk `20261121000008_admin_login_limit.sql` (pembatas login).
3. Impor katalog semua brand: `npm run db:import:all` (atau per brand: `npm run db:import <brand>`).

## 2. R2 (foto dan logo)
1. `npx wrangler login` (sekali saja).
2. Bucket `jasdor-v2-foto` sudah dibuat dan terisi foto. Cek: `npx wrangler r2 bucket list`.

## 3. Secret di Cloudflare
Jalankan satu per satu, tempel nilainya saat diminta (tidak muncul di layar):

```
npx wrangler secret put ADMIN_PASSWORD            # minimal 12 karakter
npx wrangler secret put ADMIN_SESSION_SECRET      # acak, minimal 32 karakter
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN        # bot BARU khusus v2
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put SITE_URL                  # contoh https://v2.cimagroup.my.id
```

Membuat nilai acak: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
`CATALOG_PREVIEW` jangan diisi di produksi. Brand baru muncul ke customer setelah diaktifkan di Admin → Brand.

## 4. Domain uji
Di `wrangler.jsonc` buka komentar `routes` dan isi subdomain uji, contoh:

```
"routes": [{ "pattern": "v2.cimagroup.my.id", "custom_domain": true }]
```

Domain harus sudah ada di akun Cloudflare yang sama.

## 5. Deploy
`npm run check`, lalu `npm run deploy`.

## 6. Setelah online
1. `npm run telegram:webhook` (memasang webhook bot; butuh `SITE_URL` dan token di `.env.local`).
2. Buka `/admin/login`, masuk, aktifkan brand yang siap, lalu cek logo dan foto.
3. Di GitHub repo: Settings → Secrets → Actions, isi `SITE_URL` dan `CRON_SECRET` (nilai sama dengan di Cloudflare). Penjadwal `.github/workflows/expire-orders.yml` jalan tiap 15 menit untuk merapikan pesanan kedaluwarsa. Coba sekali lewat tab Actions → Run workflow.
4. Pesan uji satu transaksi dari awal sampai notifikasi Telegram.

## Keamanan yang sudah ada
- Login admin: 5 kali salah dalam 15 menit mengunci alamat itu 15 menit (`admin_login_gate`). Alamat disimpan sebagai sidik jari hash, bukan IP asli. Kalau database tidak bisa dicek, login ditolak.
- Sesi admin cookie `httpOnly`, 7 hari. Mengganti `ADMIN_SESSION_SECRET` mengeluarkan semua sesi.
- Setiap aksi admin memeriksa sesi sendiri.
