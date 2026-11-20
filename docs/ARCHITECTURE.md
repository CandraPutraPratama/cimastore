# Jasdor v2 - Arsitektur & Rencana Bangun

Status: Tahap 0 sampai 4 selesai. Tahap 4: panel admin (login, pesanan, brand, fee, promo, pengaturan) dan kelola katalog (brand baru, editor produk, impor CSV). Berikutnya Tahap 5 (data Mixue dan McD, foto Chagee, aturan min 40k Mixue, fee) lalu Tahap 6 (go-live).
Tanggal: 21 November 2026

---

## 1. Tujuan

Website jasa order multi-brand: customer pilih brand, pilih outlet, pilih menu, bayar QRIS, lalu pesanan diteruskan ke admin lewat WhatsApp. Customer ambil sendiri (pickup) di outlet.

Satu website, satu domain, satu nomor WhatsApp untuk semua brand. Diskon dan fee berbeda tiap brand.

Brand target: Kopi Kenangan, Fore, Chagee, Chatime, Mixue, McD. (Tomoro dan Janji Jiwa dari v1 tidak dibawa.)

Semua data katalog diisi ulang dari nol oleh pemilik. Data v1 tidak dimigrasikan.

**Prinsip utama v2: nambah brand = nambah data + konfigurasi, bukan ngubah kode inti.**

### Pelajaran dari v1 (jasdorkopicima)

| Masalah di v1 | Jawaban di v2 |
| --- | --- |
| Aturan brand ditulis sebagai `if (isFore)` / `if (isTomoro)` di pricing, WhatsApp, keranjang, addon | Aturan harga jadi data (`brands.pricing_rules`), satu mesin harga generik |
| Konfigurasi bisnis KK di-hardcode (`business.ts`: allowlist kategori, hidden product, flat addition) | Semua ada di database dan bisa diubah dari panel admin |
| Tiap brand punya format data sendiri (API KK, JSON statis JJ, Excel Fore, TS hasil generate Tomoro) | Satu format katalog standar; tiap brand cuma butuh "importer" ke format itu |
| Website nembak API brand saat customer buka menu (rawan error, timeout, Error 1102) | Website hanya baca database sendiri. API brand cuma dipakai importer terjadwal |
| File besar 1.000-5.000 baris | Modul kecil per fitur, logika bisnis murni dipisah dari UI |

---

## 2. Stack

| Bagian | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js (App Router) + TypeScript + Tailwind | Sudah dikuasai, cocok untuk mobile-first |
| Hosting | Cloudflare Workers (OpenNext) | Gratis, domain sudah di Cloudflare |
| Database | Supabase Postgres (project BARU, v1 tetap jalan) | Relasional, cocok untuk katalog dan pesanan |
| Login admin | Password admin di pengaturan server + cookie sesi bertanda tangan HMAC | Satu pemilik; tanpa tabel pengguna; bisa dites penuh tanpa akses ke Supabase Auth (lihat keputusan Tahap 4) |
| Foto | Cloudflare R2 | Murah, sudah dipakai di v1 |
| Validasi | Zod | Satu skema untuk validasi input, import katalog, dan aturan harga |
| Test | Vitest | Mesin harga dan importer wajib dites |
| Job terjadwal | GitHub Actions (importer) + Cloudflare Cron (kedaluwarsa pesanan) | Importer bisa jalan lama tanpa batas CPU Workers |
| Notifikasi admin | Telegram bot | Sudah terbukti di v1 |

Estimasi beban: sekitar 120 cup per hari di hari buka. Semua masih di free tier.

---

## 3. Konsep inti

```
Brand ──< Outlet >── PriceList ──< PriceListItem >── Product
  │                                                    │
  ├──< Category ──< Product ──< ProductOptionGroup >── OptionGroup ──< Option
  │
  └── pricing_rules (JSON): diskon, fee, override harga opsi
```

- **Brand**: identitas (nama, logo, warna), fee, daftar promo, prefix ID pesanan (`KK`, `FR`, `CG`, `CT`, `MX`, `MC`), status aktif (bisa dinonaktifkan kapan saja dari admin), dan `outlet_mode`.
- **`outlet_mode`**: `catalog` (customer memilih dari daftar outlet, untuk KK, Fore, Chagee, Chatime, Mixue) atau `customer_input` (tidak ada data outlet; customer mengetik sendiri outlet tujuan saat checkout, untuk McD).
- **Outlet**: lokasi pickup. Punya jam buka sendiri dan menunjuk ke satu `PriceList`. Brand dengan `customer_input` tidak punya baris outlet.
- **PriceList**: daftar harga. Brand dengan harga seragam cukup punya satu ("Standar"). Fore bisa punya "Standar" dan "Bandara". KK yang harganya beda tiap outlet dapat satu PriceList per outlet, dibuat otomatis oleh importer. Jadi satu model menangani tiga kasus.
- **Product + OptionGroup + Option**: menu dan kustomisasinya (ukuran, gula, es, sirup, topping). OptionGroup punya aturan `min`/`max` pilihan.
- **Ketersediaan per outlet**: produk bisa disembunyikan atau ditandai habis per outlet.

### Harga: promo + fee per brand

Tiap brand punya **daftar promo** (tabel `promos`) dan **aturan fee** (`brands.fee_rules`). Keduanya diubah dari panel admin, tanpa ubah kode.

**Promo** punya bentuk yang sama untuk semua brand:

| Field | Arti |
| --- | --- |
| `level` | `transaction` (satu voucher per transaksi di app brand) atau `item` (khusus produk tertentu, bisa digabung dengan voucher transaksi, misal Boba Sundae) |
| `type` | `percent` (persen) atau `fixed` (potongan rupiah) |
| `scope` | `all_items` (berlaku ke semua item di transaksi) atau `cheapest_item` (hanya 1 item termurah, misal "item kedua 50%") |
| `max_units` | batas jumlah porsi yang dapat promo per pesanan (misal Boba Sundae: 1) |
| `min_qty` / `max_qty` | jumlah item dalam satu transaksi agar voucher berlaku (misal Chagee 30%: maks 1; Chagee 50%: tepat 2) |
| `max_uses_per_order` | berapa kali voucher boleh dipakai dalam satu pesanan (kosong = tanpa batas) |
| `value` | 50 untuk 50%, atau 30000 untuk potongan Rp30.000 |
| `max_discount` | batas maksimal potongan (opsional) |
| `min_subtotal` | minimal belanja (opsional) |
| `min_qty` | minimal jumlah item (opsional) |
| `product_ids` | kalau diisi, promo hanya untuk produk tertentu (misal Boba Sundae) |
| `applies_to` | `base_price` (harga dasar saja) atau `subtotal` (termasuk tambahan opsi) |
| `active`, `starts_at`, `ends_at` | promo bisa dimatikan atau dijadwalkan |

**Konsep "transaksi".** Pemilik membeli pesanan customer lewat app brand, dan voucher berlaku per transaksi. Satu pesanan customer bisa dibeli dalam beberapa transaksi supaya potongannya maksimal (contoh Chatime: 3 item = 3 transaksi = 3 voucher Rp10.000). Karena itu:

1. Tiap transaksi memakai paling banyak **satu voucher level `transaction`**, ditambah promo level `item` yang berlaku.
2. Kalau brand mengizinkan (`brands.split_mode = auto`), mesin harga **memecah keranjang menjadi beberapa transaksi** dengan total termurah untuk customer. Kalau `none`, semua item dalam satu transaksi.
3. Rencana pemecahan ini disimpan di pesanan dan **ditampilkan di panel admin** sebagai panduan checkout: "Transaksi 1: item A + B, pakai voucher 50%. Transaksi 2: item C, pakai voucher Rp30.000."
4. Di keranjang customer cukup tampil total potongan, plus petunjuk seperti "Tambah Rp8.000 lagi untuk dapat potongan Rp30.000".

Pencarian pemecahan terbaik dilakukan secara menyeluruh selama masih di bawah 4.000 evaluasi (biasanya keranjang sampai 7-10 porsi berbeda; porsi yang identik jauh lebih ringan). Di atas itu dipakai cara cepat (greedy berbasis efisiensi potongan). Hasil uji: waktu hitung maksimal sekitar 5 ms untuk 20 porsi berbeda, dan potongan cara cepat minimal 97% dari hasil terbaik (umumnya 100%). Batas maksimal porsi per pesanan bisa diatur per brand.

Implementasi: `src/core/pricing/engine.ts` (`priceOrder`), aturan di `src/core/pricing/rules.ts`, test berisi contoh nyata pemilik di `engine.test.ts`.

Promo awal:

| Brand | Promo | Pemecahan transaksi |
| --- | --- | --- |
| Kopi Kenangan | Dua voucher 50%: maks Rp35.000 tanpa minimal (penuh di Rp70.000), dan maks Rp30.000 min. belanja Rp50.000 (penuh di Rp60.000). Bila potongannya sama, dipakai voucher maks Rp30.000 (voucher Rp35.000 disimpan untuk di atas Rp60.000). Diskon hanya untuk harga dasar; tambahan opsi tidak didiskon. Potongan tidak pernah melebihi 50% | ya, otomatis |
| Fore | 25% maks Rp50.000 | ya, otomatis |
| Chagee | 30% untuk transaksi 1 item, maks 1x per pesanan; "50%" untuk transaksi tepat 2 item, memotong 50% dari 1 item termurah | ya: 1 item = 30%; 2 item = 50%; 3 item = 50% + 30%; 4 item = 50% + 50%, dst |
| Chatime | potongan Rp10.000 per transaksi, 1 item per voucher | ya, per item |
| Mixue | Boba Sundae 50% (level `item`, maks 1 porsi); potongan Rp10.000 min. belanja Rp40.000 (detail menunggu data Mixue) | menyusul |
| McD | menyusul | - |

Voucher tidak dibatasi jumlahnya per hari. Kalau voucher sebuah brand habis, pemilik menonaktifkan brand itu dari admin.

Catatan Chagee (dari uji checkout pemilik): 2 item @Rp45.000 = Rp90.000, potongan Rp22.500, total Rp67.500. Artinya voucher "50% 2 item" sebenarnya memotong 50% dari **satu** item saja (setara 25% dari total). "PB 10% Rp6.137" adalah pajak restoran yang sudah termasuk di harga (Rp67.500 x 10/110), bukan biaya tambahan. Pola pemecahan Chagee mengikuti keputusan pemilik di tabel atas (voucher 30% maks 1x per pesanan).

**Harga tambahan opsi Kopi Kenangan** (diambil dari v1, tidak didiskon): Large +Rp5.000, Juwara Beans +Rp3.000, Oatside +Rp3.000, Syrup +Rp6.000, Topping +Rp6.000, Whipped Cream gratis.

**Fee** jenisnya: `none` (Fore), `per_item` (opsional dengan tarif khusus kalau cuma 1 item; Chagee, Chatime), `per_order` (Mixue, Rp2.000-3.000). Nominal yang belum diputuskan diisi 0 dulu dan bisa diubah kapan saja.

**Pengaman margin:** panel admin memberi peringatan kalau fee bisa melebihi potongan promo (customer jadi tidak hemat), misalnya fee per item yang dipasangkan dengan promo potongan rupiah tetap.

**Harga tambahan opsi** (misal Large, sirup, topping) disimpan langsung di data opsi tiap brand. Kalau mau dipukul rata (seperti KK di v1: Large +Rp5.000), cukup isi angka itu di data opsinya.

Mesin harga (`priceOrder(cart, catalog, promos, feeRules)`) adalah fungsi murni tanpa akses database atau jaringan. Dipakai di browser (tampilan) dan di server (sumber kebenaran saat pesanan dibuat). Server selalu menghitung ulang; harga dari browser tidak dipercaya.

---

## 4. Alur data katalog (cara nambah brand)

```
Sumber data brand            Importer               Format standar           Database
(API / CSV / input admin) ─> (kode per brand) ─> CatalogSnapshot (Zod) ─> upsert + diff
```

1. **Format standar `CatalogSnapshot`**: berisi `outlets`, `priceLists`, `categories`, `products`, `optionGroups`, `options`. Divalidasi dengan Zod sebelum masuk database.
2. **Importer** adalah modul kecil di `src/brands/<slug>/importer.ts` yang mengubah data mentah jadi `CatalogSnapshot`. Ada dua jenis:
   - **Otomatis** (brand dengan API, misalnya KK): dijalankan GitHub Actions sesuai jadwal.
   - **Manual** (brand tanpa API): pemilik upload CSV dari panel admin (template disediakan) atau isi lewat form. **Tidak perlu kode baru sama sekali.**
3. **Sinkronisasi** membandingkan snapshot dengan isi database: menambah, mengubah, dan menonaktifkan yang hilang (tidak menghapus, supaya riwayat pesanan aman). Hasilnya dicatat di `import_runs`.
4. Foto diunduh ke R2 saat import, jadi website tidak bergantung pada CDN brand.

### Data mentah yang sudah tersedia (folder per brand di root proyek, dicek 20 Nov 2026)

| Brand | Outlet | Menu & harga | Kustomisasi (ukuran, es, gula, add-on) | Catatan |
| --- | --- | --- | --- | --- |
| Kopi Kenangan | 1.382 outlet | per outlet (1.384 file), update 16-18 Nov | `kustomisasi-kopken.json` (76 produk; 13 ditambahkan dari `template-kustomisasi.xlsx` isian pemilik, 20 Nov) | **importer selesai**: 1.364 outlet dilayani (15 Signature/Heritage/Chigo disaring, 3 menu kosong), 126 produk, semua minuman punya kustomisasi, 688 price list |
| Fore | 423 outlet | per outlet (423 file) | `kustomisasi-fore.json` (diekstrak dari v1, 74 produk) | **importer selesai**: 423 outlet, 94 produk, 1 price list. Coffee of The Day sudah tidak dijual pemilik; merchandise & "Others" sengaja tidak dijual |
| Chagee | 70 outlet | master 45 produk + harga & stok per outlet | ada | **importer selesai** (2 price list). Foto tidak dipakai karena di server pihak ketiga (`db.akzara.id`) |
| Chatime | 426 outlet | master 170 produk | ada | **importer selesai**. Sinkron terakhir 16 Sep 2026, harga mungkin sudah berubah |
| Mixue | - | - | - | menyusul |
| McD | tidak dipakai | - | - | menyusul, pakai template |

Data mentah tidak di-commit ke repo (dimasukkan `.gitignore`); yang masuk database adalah hasil importer.

Menjalankan importer (hasil di `.snapshots/<brand>.json`, divalidasi `CatalogSnapshotSchema`):

```bash
npm run snapshot -- kopi-kenangan "./Kopi Kenangan"
npm run snapshot -- fore ./Fore
npm run snapshot -- chagee ./Chagee
npm run snapshot -- chatime ./Chatime
```

Aturan importer KK (`src/brands/kopi-kenangan/importer.ts`): kategori Baru!/Coffee/Non Coffee/Kenangan Frappe/Kenangan Toast/Food; outlet Signature/Heritage/Chigo tidak dilayani; Seliter, Chigo/ChiMate/KrunChi, FLIP, air mineral disembunyikan; Jumbo tidak dijual; Large +5.000, Juwara +3.000, Oatside +3.000, Syrup/Sauce +6.000, Topping +6.000; Whipped Cream gratis pilih 1 khusus Frappe; harga coret Large/Juwara/Oatside dari kombinasi SKU asli KK. Minuman tanpa data kustomisasi tidak dijual (dilaporkan), makanan (kategori Food/Kenangan Toast, atau produk yang di data kustomisasi tidak punya pilihan sama sekali, seperti roti baru di kategori Baru!) dijual tanpa opsi.

Fore (`src/brands/fore/importer.ts`): kustomisasi dicocokkan setelah awalan Iced/Hot dibuang; pilihan es hanya untuk produk Iced; Large +7.000.

### Memasukkan ke database

```bash
npm run db:migrate              # tabel + data awal (brand, promo, pengaturan); aman diulang
npm run db:import:all           # 4 brand dari folder data mentah default
npm run db:import fore          # satu brand saja
```

Skrip memakai `DATABASE_URL` (Session pooler Supabase) di `.env.local`, dijalankan dari laptop pemilik atau GitHub Actions (jaringan sesi agent tidak bisa menjangkau supabase.co). Import satu brand berjalan dalam satu transaksi (`src/server/db/import-catalog.ts`): data yang hilang dari sumber dinonaktifkan, bukan dihapus; price list berkode hash isi sehingga import ulang tanpa perubahan harga tidak menulis ulang harga. Uji lokal (Postgres 16, data asli): import awal 4 brand sekitar 4 detik (2.283 outlet, 435 produk, 87.042 baris harga, 75.541 status produk per outlet); import ulang tanpa perubahan menulis 0 baris harga.

Chagee dan Chatime memakai format data yang sama, jadi berbagi satu konverter (`src/brands/store-menu-format.ts`): ukuran (Small/Regular/Large) menjadi grup opsi "Ukuran" dengan harga dasar = ukuran termurah; topping khusus ukuran memakai `requiresAnyOf`; price list per outlet digabung bila identik.

**Checklist nambah brand baru:**
1. Admin → Brand → Tambah: isi nama, logo, warna, prefix ID, aturan harga, jam buka.
2. Isi katalog: upload CSV (manual) atau tulis importer (otomatis).
3. Cek tampilan di mode pratinjau, lalu aktifkan.

---

## 5. Alur pesanan

1. Customer pilih brand → cari outlet → buka menu → atur kustomisasi → masuk keranjang.
   Satu keranjang = satu outlet (karena pickup di satu tempat).
2. Checkout (`/[brand]/[outlet]/checkout`): nama, nomor WA, ambil "secepatnya" atau jam tertentu hari ini (slot 15 menit, minimal 10 menit dari sekarang, dibatasi jam jasdor dan jam outlet). Nama & nomor diingat di browser customer.
3. Server (`POST /api/orders`) menghitung ulang semuanya dari menu terbaru dengan fungsi yang sama dengan keranjang (`priceCart`). Bila total beda dengan yang dilihat customer, pesanan ditolak dan halaman memuat harga baru. Pesanan disimpan dengan snapshot item, rencana transaksi + voucher, dan hash token akses.
4. Halaman pesanan (`/pesanan/<ID>?t=<token>`): total besar, QRIS dengan nominal sudah terisi, nama merchant + NMID, sisa waktu bayar (default 60 menit), tombol simpan gambar QR, cara bayar.
5. Tombol "Sudah bayar, kirim bukti ke WhatsApp" sekaligus: (a) memindahkan pesanan ke `antrian` (seperti v1, supaya admin tidak klik dua kali), (b) membuka WhatsApp admin dengan pesan terstruktur (wajib lampirkan foto bukti bayar, link pantau pesanan, rincian, total). Admin menerima notifikasi Telegram.
6. Admin mengubah status lewat tombol di notifikasi Telegram: `antrian` → `diproses` (Sedang dibelikan) → `selesai`, atau `dibatalkan`. Pesan Telegram ikut diperbarui. Batal setelah bayar otomatis ditandai perlu refund. Halaman pesanan customer memperbarui status sendiri tiap 10 detik.
7. Pesanan yang tidak dibayar sampai batas waktu menjadi `kedaluwarsa` (dicek setiap pesanan dibuka/diubah; `POST /api/cron/expire-orders` untuk merapikan sisanya). Customer yang terlanjur bayar diarahkan chat admin; admin bisa menerima pesanan kedaluwarsa kembali ke antrian.

Akses halaman pesanan pakai token rahasia per pesanan (seperti v1), bukan cuma ID. Database hanya menyimpan SHA-256 token. API memakai header `x-order-token`.

### Pesanan (Tahap 3)

- Inti murni di `src/core/orders/`: `status.ts` (siapa boleh memindah status ke mana), `pickup.ts` (jam ambil), `checkout.ts` (validasi & pembersihan input: nomor WA jadi `62...`, karakter kontrol dibuang supaya isi pesan WA/Telegram tidak bisa dipalsukan), `cart.ts` (`priceCart`, dipakai browser dan server), `messages.ts` (pesan WhatsApp, pesan + tombol Telegram), `id.ts`, `record.ts`. QRIS di `src/core/qris/qris.ts`.
- **QRIS dengan nominal**: dari payload QRIS statis pemilik (Cimatix_id, NMID ID1025374796700, GoPay + DANA), tag 01 diubah ke dinamis, tag 54 (nominal) disisipkan, CRC dihitung ulang. Merchant dan rekening penerima tidak berubah (dites: semua field lain identik). Payload disimpan di `site_settings.qrisPayload` dan dicek CRC-nya sebelum dipakai.
- Database (`supabase/migrations/20261121000004_orders.sql`): `order_create`, `order_get`, `order_transition` (ubah status atomik + catat `order_events`), `order_expire_due`, `order_set_telegram`, `site_settings_get`. Semua hanya untuk `service_role`.
- Pengaman: maksimal 3 pesanan belum dibayar per nomor WA dalam 1 jam; body request maksimal 32 KB; halaman pesanan & checkout `no-store`, `noindex`, `Referrer-Policy: no-referrer`.
- Telegram: bot khusus v2 (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`). Notifikasi berisi **panduan beli**: tiap transaksi beserta voucher dan item yang dibeli di transaksi itu. Webhook menolak request tanpa secret, dan hanya ID admin yang boleh menekan tombol. Webhook baru bisa dipasang setelah website online (`npm run telegram:webhook`).

### Panel admin (Tahap 4A)

- Alamat: `/admin` (pesanan), `/admin/brand`, `/admin/brand/[slug]` (+ `/promo/[id]`, `/menu`), `/admin/pengaturan`. Semua `no-store`, `noindex`, `no-referrer`. Layout admin lebar; halaman customer tetap kolom 480px lewat route group `src/app/(toko)/`.
- **Login**: `ADMIN_PASSWORD` (min 12 karakter) dan `ADMIN_SESSION_SECRET` (acak, min 32 karakter) di `.env.local` / secret Cloudflare. Sesi = cookie `httpOnly`, `SameSite=Lax`, berlaku 7 hari, isinya `<kedaluwarsa>.<HMAC-SHA256>` (`src/core/admin/session.ts`). Mengganti `ADMIN_SESSION_SECRET` mengeluarkan semua sesi. Password salah ditunda 0,8 detik; pembatasan per IP menyusul di Tahap 6.
- **Penjagaan**: setiap halaman DAN setiap server action memanggil `requireAdmin()` (`src/server/admin/auth.ts`). Layout saja bukan penjaga, karena form bisa dikirim langsung ke aksi.
- **Pesanan**: daftar dengan filter (Perlu diproses, Belum dibayar, Selesai, Batal, Perlu refund, Semua), pencarian ID/nama/WA, segar otomatis tiap 15-20 detik. Detail menampilkan panduan beli per transaksi, rincian bayar, tombol status sesuai aturan `status.ts`, riwayat, dan kotak **Perlu refund** (tombol "Refund sudah dikirim"). Perubahan dari admin ikut memperbarui pesan Telegram.
- **Brand**: ubah nama, warna, biaya jasa (tanpa / per item dengan tarif 1 item / per pesanan), mode pemecahan transaksi, maksimal item, urutan, aktif/nonaktif. **Promo**: tambah, ubah, aktif/nonaktif, hapus; semua field `PromoSchema` (jenis, persen/rupiah, cakupan, dasar harga, maksimal potongan, minimal belanja, rentang jumlah item, batas pakai, produk, periode dalam WIB). Form divalidasi dengan skema yang sama dengan mesin harga (`src/core/admin/forms.ts`), pesan salah per kolom.
- **Peringatan margin** (`src/core/admin/warnings.ts`): biaya jasa vs potongan tetap. Voucher transaksi dibandingkan dengan biaya jasa transaksi terkecil yang boleh memakainya; promo produk dengan biaya per item. Brand aktif tanpa menu atau outlet juga diperingatkan. Hanya peringatan, tidak memblokir.
- **Tampilan menu**: sembunyikan/tampilkan produk (`products.is_visible`, tidak ditimpa import ulang).
- **Pengaturan**: hari buka/tentatif, jam, tutup darurat, pengumuman, nomor WA admin, batas waktu bayar, ganti QRIS statis (divalidasi CRC-nya, tidak ditampilkan ulang).
- Database (`supabase/migrations/20261121000005_admin.sql`): `admin_orders_list`, `admin_order_events`, `admin_order_refund_done`, `admin_brands_list`, `admin_brand_get`, `admin_brand_update`, `admin_promo_save` / `_set_active` / `_delete`, `admin_settings_update`, `admin_products_list`, `admin_product_set_visible`. Semua hanya untuk `service_role`. Id produk di promo memakai id sumber, diubah ke id database di fungsi.

### Kelola katalog (Tahap 4B)

- **Brand baru** (`/admin/brand/baru`): nama, alamat (otomatis dari nama), kode pesanan 2-3 huruf (unik), warna, dan mode outlet (`catalog` atau `customer_input`). Dibuat nonaktif; alamat yang bentrok dengan halaman sistem (`baru`, `admin`, `api`, ...) ditolak.
- **Editor produk** (`/admin/brand/[slug]/menu/[id]`, `baru` untuk tambah): nama, kategori (ketik baru = kategori baru), deskripsi, foto, harga. Harga hanya bisa diubah bila brand punya paling banyak satu price list (harga seragam). Brand dengan harga berbeda per outlet (KK, Fore, Chatime, Chagee) menampilkan rentang harga saja; harganya diubah lewat impor data brand.
- **Impor CSV** (`/admin/brand/[slug]/impor`): dua langkah. "Periksa file" membaca dan memvalidasi (pesan per baris) lalu menampilkan pratinjau tanpa mengubah data; "Impor sekarang" memeriksa ulang di server lalu menulis. Kolom menu: kategori, nama, harga (wajib), deskripsi, foto, kode (opsional). Kolom outlet: kode, nama (wajib), kota, alamat, buka, tutup, lat, lng. Pemisah koma/titik koma/tab dikenali otomatis; harga "35.000" / "Rp35.000" / "35000".
  - Impor ulang tidak menggandakan: kategori dan produk dicocokkan dengan nama (tanpa beda huruf besar/kecil) atau kolom `kode`, lalu memakai id lama.
  - Opsi "nonaktifkan yang tidak ada di file" (default aktif) memakai mekanisme yang sama dengan importer laptop: yang hilang hanya `is_active = false`, riwayat pesanan aman.
  - Tanpa file outlet, outlet yang ada tidak disentuh. Brand `customer_input` otomatis punya satu outlet internal berkode `menu` (nama = "Menu") supaya menunya bisa dialamatkan; checkout McD memakainya di Tahap 5.
  - Tidak menyentuh grup opsi (ukuran, es, topping). Brand dengan beberapa price list ditolak.
- **Database** (`supabase/migrations/20261121000006_admin_catalog.sql`): `admin_brand_create`, `admin_catalog_import`, `admin_catalog_context`, `admin_import_runs`, `admin_product_get`, `admin_product_save`. `admin_catalog_import` adalah port SQL dari `src/server/db/import-catalog.ts` (dipakai CLI di laptop). Keduanya diuji menghasilkan data dan statistik identik, termasuk impor ulang (hapus produk, ganti harga, nonaktifkan outlet). Opsi `p_options`: `deactivateMissing`, `syncOutlets`, `rewritePriceLists`, `replaceOptions`.

### Foto produk (R2)

- **Bucket**: `jasdor-v2-foto` (binding `FOTO` di `wrangler.jsonc`), privat. Foto tidak diakses langsung dari R2; website menayangkannya lewat rute `/foto/<kunci>` (`src/app/foto/[...key]/route.ts`) dengan `Cache-Control: public, max-age=31536000, immutable` dan ETag.
- **Kunci** `<brand>/<id-produk>.<hash8>.<ext>` memuat hash isi file, jadi foto yang diganti otomatis mendapat alamat baru dan cache tidak pernah basi. Pola kunci divalidasi (`PHOTO_KEY_PATTERN`) sebelum menyentuh R2.
- **Unggah**: `npm run foto:upload <brand> [periksa|lokal] [folder]` dari laptop (`scripts/foto-upload.ts`). Mencocokkan berkas dengan produk lewat kode (id produk atau kode di alamat foto sumber), lalu nama produk; yang tidak cocok atau ambigu dilaporkan, tidak ditebak. Aman diulang: foto selalu diunggah ulang ke tujuan yang dipilih (R2 asli dan R2 simulasi lokal adalah dua tempat terpisah, sedangkan `image_key` di database dipakai bersama). Pengunggahan memakai `wrangler r2 object put`; `periksa` hanya menampilkan pencocokan; `lokal` memakai R2 simulasi untuk `npm run dev`.
- **Tampil**: `catalog_menu` (migrasi 0007) mengirim `/foto/<image_key>` bila produk punya `image_key`, selain itu alamat foto sumber. Foto yang gagal dimuat diganti huruf awal produk. Impor ulang tidak menyentuh `image_key`.
- Logo brand tidak termasuk foto produk (berkas yang tidak cocok produk dilaporkan saja).

### Tampilan customer (Tahap 2)

- Data dibaca lewat 3 fungsi SQL, masing-masing satu perjalanan ke database: `catalog_home`, `catalog_outlets`, `catalog_menu` (`supabase/migrations/20261121000001_catalog_read.sql`). Hak eksekusi hanya untuk `service_role`; browser tidak pernah memanggil Supabase.
- Server memanggilnya lewat `src/server/db/rpc.ts`: API Supabase bila `SUPABASE_URL` + `SUPABASE_SECRET_KEY` ada; koneksi Postgres langsung (`DATABASE_URL`) hanya untuk development tanpa API.
- Halaman: `/` (brand), `/[brand]` (pilih outlet), `/[brand]/[outlet]` (menu). Keranjang disimpan di browser per brand+outlet dan selalu dihitung ulang dari menu terbaru dengan `priceLine` + `priceOrder` (logika yang sama dengan server).
- Desain: satu kolom ala aplikasi HP (maks 480px), font Plus Jakarta Sans (dibundel, tanpa Google Fonts), tinta biru tua, aksen marigold, hijau khusus angka hemat. Satu elemen menonjol: angka "Kamu hemat" di keranjang berbentuk struk, dihitung jujur: harga asli di outlet dikurangi total yang dibayar (biaya jasa ikut dihitung).
- Uji lokal: 20.327 harga & opsi dari `catalog_menu` dicocokkan dengan mesin harga, 0 beda. `catalog_menu` ±7 ms, `catalog_outlets` ±9 ms di Postgres lokal. Menu terbesar (Chatime) ±36 KB setelah kompresi.
- Makanan KK dijual tanpa pilihan (data sumber menempelkan add-on minuman ke 6 roti).

## 6. Skema database (ringkas)

| Tabel | Isi penting |
| --- | --- |
| `brands` | slug, nama, logo, tema, `order_prefix`, `fee_rules` (jsonb), `outlet_mode`, `split_mode`, maks porsi per pesanan, `importer` (`manual`/`api`), aktif, urutan |
| `promos` | brand_id, nama, level, type, scope, value, max_discount, min_subtotal, min_qty, max_units, product_ids, applies_to, aktif, periode |
| `outlets` | brand_id, `external_code`, nama, kota, alamat, lat/lng, `hours`, price_list_id, aktif, `last_synced_at` |
| `price_lists` / `price_list_items` | daftar harga dan harga per produk |
| `categories` | brand_id, nama, urutan, tampil/tidak |
| `products` | brand_id, category_id, `external_id`, nama, deskripsi, foto (key R2), tampil/tidak, urutan |
| `option_groups` / `options` / `product_option_groups` | kustomisasi beserta tambahan harga dan aturan min/max |
| `outlet_product_status` | per outlet: tersedia / habis / disembunyikan |
| `orders` | id (`KK-XXXXXX`), brand, outlet (atau teks outlet dari customer untuk McD), customer, pickup, snapshot item (jsonb), rencana transaksi + voucher yang dipakai (jsonb), subtotal, diskon, fee, total, status, token hash, waktu |
| `order_events` | riwayat perubahan status beserta pelakunya |
| `site_settings` | hari dan jam buka global (sama untuk semua brand: Jumat-Minggu 08.00-23.20 WIB, Selasa tentatif), nomor WA, QRIS, pengumuman, mode tutup darurat |
| `import_runs` | log tiap import: brand, sumber, jumlah perubahan, error |

Row Level Security aktif di semua tabel. Customer tidak mengakses Supabase langsung; semua lewat API route server.

---

## 7. Struktur folder

```
src/
  app/                    halaman & API route (tipis, hanya memanggil modul di bawah)
    (toko)/               beranda, [brand], [brand]/[outlet], checkout, pesanan/[id] (kolom 480px)
    admin/                pesanan, brand (baru, promo, menu, impor CSV), pengaturan
    api/
  core/                   logika bisnis murni, tanpa Next.js/Supabase
    pricing/              mesin harga + test
    catalog/              skema CatalogSnapshot (Zod), diff
    orders/               state machine status, pembuatan ID
    hours/                aturan jam buka
    whatsapp/             penyusun pesan WA (generik untuk semua brand)
  brands/
    kopi-kenangan/importer.ts
    fore/importer.ts
    registry.ts           daftar importer otomatis
  server/                 akses Supabase, R2, Telegram
  components/
supabase/migrations/
tests/
docs/
```

Aturan ketergantungan: `core/` tidak boleh import dari `app/`, `server/`, atau `brands/`. Dengan begitu logika inti bisa dites tanpa server.

---

## 8. Tahapan bangun

| Tahap | Isi | Hasil yang bisa dicek |
| --- | --- | --- |
| 0. Fondasi | Repo, Next.js, Tailwind, lint, Vitest, CI, `CLAUDE.md`, project Supabase baru | `npm test` dan build lolos |
| 1. Inti | Migrasi database, mesin harga + promo + test semua promo brand, skema `CatalogSnapshot`, importer dari format data pemilik | Test harga tiap promo cocok dengan contoh hitungan nyata |
| 2. Katalog customer | Pilih brand, cari outlet, menu, sheet produk, keranjang | Bisa menyusun keranjang di HP |
| 3. Checkout | Buat pesanan, halaman QRIS, pesan WA, Telegram, kedaluwarsa otomatis | Pesanan uji masuk dari awal sampai selesai |
| 4A. Admin | Login, panel pesanan, kelola brand, fee, promo, tampilan menu, pengaturan situs | Selesai: alur pesanan dan promo diuji end-to-end |
| 4B. Admin katalog | Tambah brand baru, editor produk dan harga, impor CSV | Selesai: brand uji dibuat dan diisi lewat admin tanpa ubah kode |
| 5. Brand | Import data KK, Fore, Chagee, Chatime, Mixue dari data pemilik; McD (menu saja) menyusul | Semua brand target tampil |
| 6. Go-live | Rate limit, header keamanan, Lighthouse, runbook, deploy ke subdomain uji, lalu pindah ke `jasdor.cimagroup.my.id` | v2 menggantikan v1 |

Fitur v1 yang **ditunda** sampai setelah go-live (disetujui pemilik): pesanan grup, paket bundling, kotak WiFi KK, galeri testimoni, pesan ulang, PWA.

Catatan McD: tanpa data outlet (customer mengetik outlet sendiri). Menunya punya paket/combo (pilih burger + minuman + side). Model OptionGroup bisa menampungnya (grup "Pilih minuman" min 1 max 1). Template pengisian data menu McD diberikan ke pemilik setelah format katalog final di Tahap 1.

---

## 9. Keputusan

### Sudah diputuskan (20 Nov 2026)

- Tomoro dan Janji Jiwa tidak dibawa ke v2.
- Semua data diisi ulang dari nol oleh pemilik; data sudah tersedia kecuali McD.
- McD: menu saja, tanpa data outlet; outlet diketik customer.
- Jadwal buka sama untuk semua brand; tiap brand bisa dinonaktifkan dari admin.
- Fitur v1 tambahan ditunda sampai setelah go-live.
- v2 dites di subdomain baru dulu sebelum menggantikan v1.
- Fore: fee Rp0. Mixue: fee per pesanan (Rp2.000-3.000). Chagee dan Chatime: fee per item. Nominal yang belum diputuskan diisi 0 dulu.
- Voucher dipilih otomatis yang paling menguntungkan customer. Chatime: 1 voucher per item.
- KK: dua voucher 50% (maks Rp35.000 tanpa minimal; maks Rp30.000 min. Rp50.000). Harga normal di bawah Rp60.000 pakai voucher min. Rp50.000, di atasnya voucher maks Rp35.000; potongan tidak boleh melebihi 50%. Tambahan opsi pakai harga flat v1 dan tidak didiskon.
- Mixue: Boba Sundae 50% maks 1 porsi per pesanan, bisa digabung dengan potongan Rp10.000.
- Folder proyek: `websitebisnis/jasdor-v2`.
- Harga dasar KK mengikuti data menu per outlet (bukan aturan per jenis outlet). Contoh Kopi Kenangan Mantan: Rp19.000 di 1.203 outlet, Rp22.000 di 152 outlet, Rp32.000 di 7 outlet (6 bandara + Bayfront Mall Batam). Outlet berharga Rp32.000 tetap dilayani.
- Fore Coffee of The Day tidak dijual. Outlet KK berkategori Kenangan Signature disaring.
- Koreksi isian template KK: Choco Caramel Frappe hanya Ice; Earl Grey Tea tanpa pilihan susu; harga asli yang diisi sama dengan harga Regular dianggap "tidak ada data" (harga coret memakai tambahan harga jasdor).
- Pesanan dipecah otomatis menjadi beberapa transaksi; voucher tanpa batas harian.
- Chagee: 1 item = 30%, 2 item = 50%, 3 item = 50% + 30%.
- Kustomisasi KK dari `kustomisasi-kopken.json` (pemilik, 20 Nov), harga add-on KK dari v1. Kustomisasi Fore dari v1. Minuman tanpa data kustomisasi tidak dijual sampai datanya ada.

### Diputuskan saat Tahap 3 (21 Nov 2026)

- "Sudah bayar" dari customer langsung masuk antrian (mengikuti v1). Admin mengecek bukti bayar di WhatsApp.
- QRIS ditampilkan dengan nominal terisi (dibuat dari QRIS statis pemilik), batas bayar 60 menit (bisa diubah di `site_settings.paymentExpiryMinutes`).
- Nomor WA admin sama dengan v1 (6287793420768).
- Format pesan WhatsApp mengikuti v1 (wajib lampirkan foto bukti bayar, link pantau pesanan).

### Diputuskan saat Tahap 4 (21 Nov 2026)

- Login admin memakai password di pengaturan server + cookie sesi bertanda tangan, bukan Supabase Auth. Alasan: hanya satu admin (pemilik), tidak ada tabel pengguna, dan seluruh alurnya bisa dites penuh tanpa akses ke layanan Supabase Auth. Bila nanti butuh lebih dari satu admin, ganti `src/server/admin/auth.ts` (halaman dan aksi hanya memanggil `requireAdmin()`).
- Menu yang disembunyikan admin tetap tersembunyi setelah import ulang (import tidak menyentuh `products.is_visible`).
- Menandai refund selesai dicatat di riwayat pesanan; pengiriman uangnya tetap manual oleh pemilik.

### Masih terbuka

1. Mixue: aturan minimal belanja Rp40.000 terhadap Boba Sundae (menunggu data Mixue). Sementara mesin harga menghitung minimal belanja setelah potongan promo item.
2. Foto Chagee: cari dari sumber resmi Chagee, bukan dari server pihak ketiga.
3. Fee Chagee, Chatime, Mixue (diisi 0 dulu).
4. Uji bayar sungguhan QRIS bernominal dari beberapa aplikasi (GoPay, DANA, m-banking) sebelum go-live.
5. Bot Telegram v2 + pemasangan webhook menunggu website online di subdomain uji (Tahap 6). Penjadwal `expire-orders` (GitHub Actions) juga di Tahap 6.
6. Checkout McD (outlet diketik customer) menyusul bersama data menu McD (Tahap 5).
7. Data brand lama (KK, Fore, Chagee, Chatime) masih diimpor lewat `npm run db:import` di laptop karena punya opsi dan harga per outlet; impor CSV di admin untuk brand sederhana (Mixue, McD, brand baru).
8. Foto produk dari CSV memakai alamat web apa adanya; untuk brand dengan foto sendiri pakai `npm run foto:upload`. Logo brand belum punya tempat unggah (kolom `logo_url` ada, belum dipakai tampilan).
