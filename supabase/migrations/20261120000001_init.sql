-- =============================================================================
-- Jasdor v2 - skema awal
-- Lihat docs/ARCHITECTURE.md bagian 3 (konsep) dan 6 (tabel).
--
-- Semua nominal uang: integer rupiah.
-- Kolom external_id / external_code = id dari sumber data brand (CatalogSnapshot).
-- RLS aktif di semua tabel tanpa policy publik: akses hanya lewat server
-- (service role). Browser tidak pernah membaca Supabase langsung.
-- =============================================================================

-- Di Supabase ekstensi ditaruh di schema "extensions".
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Brand & aturan harga
-- -----------------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  logo_url text,
  theme jsonb not null default '{}'::jsonb,
  order_prefix text not null unique check (order_prefix ~ '^[A-Z]{2,3}$'),
  -- Lihat FeeRulesSchema di src/core/pricing/rules.ts
  fee_rules jsonb not null default '{"type":"none"}'::jsonb,
  outlet_mode text not null default 'catalog' check (outlet_mode in ('catalog', 'customer_input')),
  split_mode text not null default 'auto' check (split_mode in ('none', 'auto')),
  max_items_per_order integer not null default 20 check (max_items_per_order between 1 and 100),
  importer text not null default 'manual' check (importer in ('manual', 'api')),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- Lihat PromoSchema di src/core/pricing/rules.ts
create table public.promos (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  level text not null check (level in ('transaction', 'item')),
  type text not null check (type in ('percent', 'fixed')),
  value integer not null check (value > 0),
  scope text not null default 'all_items' check (scope in ('all_items', 'cheapest_item')),
  applies_to text not null default 'subtotal' check (applies_to in ('base_price', 'subtotal')),
  max_discount integer check (max_discount > 0),
  min_subtotal integer check (min_subtotal > 0),
  min_qty integer check (min_qty > 0),
  max_qty integer check (max_qty > 0),
  max_uses_per_order integer check (max_uses_per_order > 0),
  max_units integer check (max_units > 0),
  -- Berisi products.id; diperiksa oleh aplikasi saat promo disimpan.
  product_ids uuid[],
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'percent' or value <= 100),
  check (min_qty is null or max_qty is null or min_qty <= max_qty),
  check (level <> 'item' or coalesce(cardinality(product_ids), 0) > 0),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create index promos_brand_idx on public.promos (brand_id);
create trigger promos_updated_at before update on public.promos
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Katalog
-- -----------------------------------------------------------------------------

create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  unique (brand_id, code)
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  external_code text not null,
  name text not null,
  city text,
  address text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  open_time time,
  close_time time,
  price_list_id uuid not null references public.price_lists (id) on delete restrict,
  -- false = hilang dari data sumber terakhir atau dinonaktifkan admin.
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, external_code)
);

create index outlets_brand_active_idx on public.outlets (brand_id) where is_active;
create index outlets_name_trgm_idx on public.outlets using gin (name extensions.gin_trgm_ops);
create index outlets_city_trgm_idx on public.outlets using gin (city extensions.gin_trgm_ops);
create trigger outlets_updated_at before update on public.outlets
  for each row execute function public.set_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  external_id text not null,
  name text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  is_active boolean not null default true,
  unique (brand_id, external_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  external_id text not null,
  name text not null,
  description text,
  -- Key objek di R2 (foto yang sudah dimirror). Kosong = belum ada foto.
  image_key text,
  -- URL foto asli dari sumber, hanya dipakai saat mirror.
  image_source_url text,
  sort_order integer not null default 0,
  -- is_visible diatur admin; is_active diatur importer (false = hilang dari sumber).
  is_visible boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, external_id)
);

create index products_category_idx on public.products (category_id);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  external_id text not null,
  name text not null,
  selection text not null check (selection in ('single', 'multiple')),
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select > 0),
  is_active boolean not null default true,
  unique (brand_id, external_id),
  check (max_select is null or min_select <= max_select)
);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  group_id uuid not null references public.option_groups (id) on delete cascade,
  external_id text not null,
  name text not null,
  price_delta integer not null default 0 check (price_delta >= 0),
  compare_at_delta integer check (compare_at_delta >= 0),
  is_default boolean not null default false,
  -- external_id opsi lain (dalam brand yang sama) yang salah satunya wajib dipilih.
  requires_any_of text[],
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (brand_id, external_id)
);

create index options_group_idx on public.options (group_id);

create table public.product_option_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id uuid not null references public.option_groups (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);

create table public.price_list_items (
  price_list_id uuid not null references public.price_lists (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  base_price integer not null check (base_price >= 0),
  compare_at_price integer check (compare_at_price >= 0),
  primary key (price_list_id, product_id)
);

-- Override tambahan harga opsi untuk produk tertentu di price list tertentu
-- (misal harga Large Chagee yang berbeda per outlet).
create table public.price_list_option_deltas (
  price_list_id uuid not null references public.price_lists (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  option_id uuid not null references public.options (id) on delete cascade,
  price_delta integer not null check (price_delta >= 0),
  primary key (price_list_id, product_id, option_id)
);

create table public.outlet_product_status (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status text not null check (status in ('sold_out', 'hidden')),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, product_id)
);

-- -----------------------------------------------------------------------------
-- Pesanan
-- -----------------------------------------------------------------------------

create table public.orders (
  -- Format: <prefix brand>-<6 karakter>, contoh KK-7F3K9Q
  id text primary key check (id ~ '^[A-Z]{2,3}-[0-9A-Z]{6}$'),
  brand_id uuid not null references public.brands (id) on delete restrict,
  outlet_id uuid references public.outlets (id) on delete set null,
  -- Nama outlet saat pesanan dibuat, atau teks outlet yang diketik customer (McD).
  outlet_label text not null,
  customer_name text not null check (char_length(customer_name) between 1 and 60),
  customer_wa text not null check (customer_wa ~ '^62[0-9]{8,13}$'),
  pickup_mode text not null check (pickup_mode in ('now', 'scheduled')),
  pickup_at timestamptz not null,
  -- Snapshot baris keranjang (PricedLine[]).
  items jsonb not null,
  -- Snapshot hasil mesin harga: transaksi, voucher, promo item (PricedOrder tanpa lines).
  pricing jsonb not null,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null check (discount >= 0),
  fee integer not null check (fee >= 0),
  total integer not null check (total >= 0),
  status text not null default 'menunggu_pembayaran' check (
    status in (
      'menunggu_pembayaran',
      'menunggu_konfirmasi',
      'antrian',
      'diproses',
      'selesai',
      'dibatalkan',
      'kedaluwarsa'
    )
  ),
  -- SHA-256 dari token akses rahasia per pesanan (token asli hanya dipegang customer).
  access_token_hash text not null,
  notes text,
  cancellation_reason text,
  needs_refund boolean not null default false,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = subtotal - discount + fee)
);

create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_customer_wa_idx on public.orders (customer_wa);
create index orders_expires_idx on public.orders (expires_at) where status = 'menunggu_pembayaran';
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  -- 'customer', 'system', atau email admin.
  actor text not null,
  note text,
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

-- -----------------------------------------------------------------------------
-- Pengaturan & log import
-- -----------------------------------------------------------------------------

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  source text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  -- Jumlah baris ditambah / diubah / dinonaktifkan per tabel.
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index import_runs_brand_idx on public.import_runs (brand_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security: aktif tanpa policy = tertutup untuk anon & authenticated.
-- -----------------------------------------------------------------------------

alter table public.brands enable row level security;
alter table public.promos enable row level security;
alter table public.price_lists enable row level security;
alter table public.outlets enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.option_groups enable row level security;
alter table public.options enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.price_list_items enable row level security;
alter table public.price_list_option_deltas enable row level security;
alter table public.outlet_product_status enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.site_settings enable row level security;
alter table public.import_runs enable row level security;
