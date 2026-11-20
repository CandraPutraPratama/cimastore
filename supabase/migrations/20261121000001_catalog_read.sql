-- =============================================================================
-- Fungsi baca katalog untuk website customer.
-- Tiap halaman cukup SATU panggilan (satu perjalanan ke database).
-- Dipanggil server website lewat API Supabase (secret key). Tidak bisa dipanggil
-- dari browser: hak eksekusi dicabut dari anon & authenticated.
--
-- Semua id yang keluar adalah id sumber (external_id), sama seperti CatalogSnapshot.
-- p_include_inactive = true hanya untuk pratinjau brand yang belum diaktifkan.
-- =============================================================================

-- Beranda: pengaturan situs + daftar brand.
create or replace function public.catalog_home(p_include_inactive boolean default false)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'settings', (select settings from site_settings where id = 1),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', b.slug,
        'name', b.name,
        'logoUrl', b.logo_url,
        'theme', b.theme,
        'outletMode', b.outlet_mode,
        'isActive', b.is_active,
        'outletCount', (select count(*) from outlets o where o.brand_id = b.id and o.is_active),
        'promoNames', (
          select coalesce(jsonb_agg(p.name order by p.sort_order), '[]'::jsonb)
          from promos p
          where p.brand_id = b.id and p.is_active
            and (p.starts_at is null or p.starts_at <= now())
            and (p.ends_at is null or p.ends_at > now())
        )
      ) order by b.sort_order)
      from brands b
      where b.is_active or p_include_inactive
    ), '[]'::jsonb)
  );
$$;

-- Daftar / pencarian outlet satu brand. Tanpa kata kunci: urut jarak (bila lokasi
-- diberikan) lalu nama. Dengan kata kunci: cocok nama/kota/alamat, toleran salah ketik.
create or replace function public.catalog_outlets(
  p_brand text,
  p_query text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 30,
  p_include_inactive boolean default false
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with b as (
    select * from brands where slug = p_brand and (is_active or p_include_inactive)
  ),
  q as (
    select nullif(btrim(p_query), '') as text,
           '%' || replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  candidates as (
    select o.external_code, o.name, o.city, o.address,
           to_char(o.open_time, 'HH24:MI') as open_time,
           to_char(o.close_time, 'HH24:MI') as close_time,
           case when p_lat is not null and p_lng is not null and o.lat is not null and o.lng is not null then
             6371 * 2 * asin(sqrt(
               power(sin(radians(o.lat - p_lat) / 2), 2) +
               cos(radians(p_lat)) * cos(radians(o.lat)) * power(sin(radians(o.lng - p_lng) / 2), 2)
             ))
           end as distance_km,
           case when q.text is not null then
             (o.name ilike q.pattern or coalesce(o.city, '') ilike q.pattern or coalesce(o.address, '') ilike q.pattern)
           end as contains_match,
           case when q.text is not null then
             greatest(similarity(o.name, q.text), similarity(coalesce(o.city, ''), q.text))
           end as score
    from outlets o
    join b on b.id = o.brand_id
    cross join q
    where o.is_active
  ),
  picked as (
    select * from candidates
    where contains_match is null or contains_match or score > 0.3
    order by contains_match desc nulls last, score desc nulls last, distance_km asc nulls last, name
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select case when not exists (select 1 from b) then null else jsonb_strip_nulls(jsonb_build_object(
    'brand', (select jsonb_build_object('slug', slug, 'name', name, 'outletMode', outlet_mode, 'theme', theme, 'isActive', is_active) from b),
    'total', (select count(*) from candidates),
    'outlets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', external_code,
        'name', name,
        'city', city,
        'address', address,
        'openTime', open_time,
        'closeTime', close_time,
        'distanceKm', round(distance_km::numeric, 1)
      ) order by contains_match desc nulls last, score desc nulls last, distance_km asc nulls last, name)
      from picked
    ), '[]'::jsonb)
  )) end;
$$;

-- Menu lengkap satu outlet: brand, promo, outlet, kategori, grup opsi (sekali saja),
-- dan produk dengan harga dari price list outlet. Produk "hidden" tidak dikirim.
create or replace function public.catalog_menu(
  p_brand text,
  p_outlet text,
  p_include_inactive boolean default false
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with b as (
    select * from brands where slug = p_brand and (is_active or p_include_inactive)
  ),
  o as (
    select o.* from outlets o join b on b.id = o.brand_id
    where o.external_code = p_outlet and o.is_active
  ),
  prod as (
    select p.id, p.external_id, p.name, p.description, p.image_source_url, p.sort_order,
           c.external_id as category_id, c.sort_order as category_sort,
           pli.base_price, pli.compare_at_price,
           coalesce(ops.status, 'available') as status
    from o
    join price_list_items pli on pli.price_list_id = o.price_list_id
    join products p on p.id = pli.product_id and p.is_active and p.is_visible
    join categories c on c.id = p.category_id and c.is_active and c.is_visible
    left join outlet_product_status ops on ops.outlet_id = o.id and ops.product_id = p.id
    where coalesce(ops.status, 'available') <> 'hidden'
  ),
  used_groups as (
    select distinct g.id, g.external_id, g.name, g.selection, g.min_select, g.max_select
    from prod
    join product_option_groups pog on pog.product_id = prod.id
    join option_groups g on g.id = pog.group_id and g.is_active
  )
  select case when not exists (select 1 from o) then null else jsonb_strip_nulls(jsonb_build_object(
    'brand', (
      select jsonb_build_object(
        'slug', slug, 'name', name, 'outletMode', outlet_mode, 'splitMode', split_mode,
        'feeRules', fee_rules, 'maxItemsPerOrder', max_items_per_order, 'theme', theme, 'isActive', is_active)
      from b
    ),
    'promos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'level', p.level, 'type', p.type, 'value', p.value,
        'scope', p.scope, 'appliesTo', p.applies_to, 'maxDiscount', p.max_discount,
        'minSubtotal', p.min_subtotal, 'minQty', p.min_qty, 'maxQty', p.max_qty,
        'maxUsesPerOrder', p.max_uses_per_order, 'maxUnits', p.max_units,
        'productIds', (select jsonb_agg(pr.external_id) from products pr where pr.id = any(p.product_ids)),
        'active', p.is_active, 'startsAt', p.starts_at, 'endsAt', p.ends_at
      ) order by p.sort_order), '[]'::jsonb)
      from promos p join b on b.id = p.brand_id
      where p.is_active
    ),
    'outlet', (
      select jsonb_build_object(
        'code', external_code, 'name', name, 'city', city, 'address', address,
        'openTime', to_char(open_time, 'HH24:MI'), 'closeTime', to_char(close_time, 'HH24:MI'))
      from o
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.external_id, 'name', c.name) order by c.sort_order), '[]'::jsonb)
      from categories c join b on b.id = c.brand_id
      where c.is_active and c.is_visible and exists (select 1 from prod where prod.category_id = c.external_id)
    ),
    'optionGroups', (
      select coalesce(jsonb_object_agg(g.external_id, jsonb_build_object(
        'id', g.external_id, 'name', g.name, 'selection', g.selection,
        'min', g.min_select, 'max', g.max_select,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', op.external_id, 'name', op.name, 'priceDelta', op.price_delta,
            'compareAtDelta', op.compare_at_delta, 'isDefault', op.is_default,
            'requiresAnyOf', op.requires_any_of
          ) order by op.sort_order), '[]'::jsonb)
          from options op where op.group_id = g.id and op.is_active
        )
      )), '{}'::jsonb)
      from used_groups g
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', prod.external_id,
        'categoryId', prod.category_id,
        'name', prod.name,
        'description', prod.description,
        'imageUrl', prod.image_source_url,
        'basePrice', prod.base_price,
        'compareAtPrice', prod.compare_at_price,
        'status', prod.status,
        'optionGroupIds', (
          select coalesce(jsonb_agg(g.external_id order by pog.sort_order), '[]'::jsonb)
          from product_option_groups pog
          join option_groups g on g.id = pog.group_id and g.is_active
          where pog.product_id = prod.id
        ),
        'optionDeltas', (
          select coalesce(jsonb_object_agg(op.external_id, d.price_delta), '{}'::jsonb)
          from o
          join price_list_option_deltas d on d.price_list_id = o.price_list_id and d.product_id = prod.id
          join options op on op.id = d.option_id
        )
      ) order by prod.category_sort, prod.sort_order), '[]'::jsonb)
      from prod
    )
  )) end;
$$;

-- Hanya server (service_role) yang boleh memanggil.
revoke execute on function public.catalog_home(boolean) from public;
revoke execute on function public.catalog_outlets(text, text, double precision, double precision, integer, boolean) from public;
revoke execute on function public.catalog_menu(text, text, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.catalog_home(boolean) from anon, authenticated';
    execute 'revoke execute on function public.catalog_outlets(text, text, double precision, double precision, integer, boolean) from anon, authenticated';
    execute 'revoke execute on function public.catalog_menu(text, text, boolean) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.catalog_home(boolean) to service_role';
    execute 'grant execute on function public.catalog_outlets(text, text, double precision, double precision, integer, boolean) to service_role';
    execute 'grant execute on function public.catalog_menu(text, text, boolean) to service_role';
  end if;
end;
$$;
