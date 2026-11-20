-- =============================================================================
-- Data awal Jasdor v2: brand, promo, dan pengaturan situs.
-- Semua brand dibuat NONAKTIF; aktifkan dari admin setelah katalognya diimport.
-- Fee yang belum diputuskan pemilik diisi 0 (bisa diubah kapan saja).
-- =============================================================================

insert into public.brands (slug, name, order_prefix, fee_rules, outlet_mode, split_mode, importer, sort_order)
values
  ('kopi-kenangan', 'Kopi Kenangan', 'KK', '{"type":"per_item","amount":2300,"singleItemAmount":4000}', 'catalog', 'auto', 'manual', 10),
  ('fore',          'Fore Coffee',   'FR', '{"type":"none"}',                                            'catalog', 'auto', 'manual', 20),
  ('chagee',        'CHAGEE',        'CG', '{"type":"per_item","amount":0,"singleItemAmount":null}',     'catalog', 'auto', 'manual', 30),
  ('chatime',       'Chatime',       'CT', '{"type":"per_item","amount":0,"singleItemAmount":null}',     'catalog', 'auto', 'manual', 40),
  ('mixue',         'Mixue',         'MX', '{"type":"per_order","amount":0}',                            'catalog', 'auto', 'manual', 50),
  ('mcd',           'McDonald''s',   'MC', '{"type":"none"}',                                            'customer_input', 'auto', 'manual', 60)
on conflict (slug) do nothing;

-- Promo per brand (keputusan pemilik, 20 Nov 2026). Promo Mixue menunggu data menu
-- (Boba Sundae butuh products.id), promo McD menyusul.
insert into public.promos (brand_id, name, level, type, value, scope, applies_to, max_discount, min_subtotal, min_qty, max_qty, max_uses_per_order, sort_order)
select b.id, p.name, p.level, p.type, p.value, p.scope, p.applies_to, p.max_discount, p.min_subtotal, p.min_qty, p.max_qty, p.max_uses_per_order, p.sort_order
from (
  values
    ('kopi-kenangan', 'Diskon 50% (maks Rp35.000)',   'transaction', 'percent', 50,    'all_items',     'base_price', 35000, null::int, null::int, null::int, null::int, 10),
    ('kopi-kenangan', 'Potongan Rp30.000 (min Rp50.000)', 'transaction', 'fixed', 30000, 'all_items',     'base_price', null,  50000,     null,      null,      null,      20),
    ('fore',          'Diskon 25% (maks Rp50.000)',   'transaction', 'percent', 25,    'all_items',     'subtotal',   50000, null,      null,      null,      null,      10),
    ('chagee',        'Diskon 30% (1 item)',          'transaction', 'percent', 30,    'all_items',     'subtotal',   null,  null,      null,      1,         1,         10),
    ('chagee',        'Diskon 50% (2 item)',          'transaction', 'percent', 50,    'cheapest_item', 'subtotal',   null,  null,      2,         2,         null,      20),
    ('chatime',       'Potongan Rp10.000 per item',   'transaction', 'fixed',   10000, 'all_items',     'subtotal',   null,  null,      null,      1,         null,      10),
    ('mixue',         'Potongan Rp10.000 (min Rp40.000)', 'transaction', 'fixed', 10000, 'all_items',     'subtotal',   null,  40000,     null,      null,      null,      20)
) as p (brand_slug, name, level, type, value, scope, applies_to, max_discount, min_subtotal, min_qty, max_qty, max_uses_per_order, sort_order)
join public.brands b on b.slug = p.brand_slug
where not exists (select 1 from public.promos x where x.brand_id = b.id and x.name = p.name);

insert into public.site_settings (id, settings)
values (
  1,
  '{
    "openDays": [5, 6, 0],
    "tentativeDays": [2],
    "openTime": "08:00",
    "closeTime": "23:20",
    "timeZone": "Asia/Jakarta",
    "whatsappNumber": "",
    "qrisImageKey": null,
    "announcement": null,
    "emergencyClosed": false
  }'::jsonb
)
on conflict (id) do nothing;
