-- Tahap 4: panel admin.
-- Semua akses lewat fungsi di bawah, hanya untuk service_role (server website).
-- Siapa boleh memanggil diputuskan kode server (sesi admin); database hanya mengerjakan
-- perubahan dan menjaga agar data tetap konsisten.

-- -----------------------------------------------------------------------------
-- Pesanan
-- -----------------------------------------------------------------------------

/*
  Daftar pesanan untuk panel admin.
  p_filter: aktif | bayar | selesai | batal | refund | semua
  Hasil: { orders: [ringkasan], counts: { aktif, bayar, selesai, batal, refund } }
*/
create or replace function public.admin_orders_list(
  p_filter text default 'aktif',
  p_query text default null,
  p_limit integer default 60
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_pattern text;
  v_digits text;
  v_orders jsonb;
  v_counts jsonb;
begin
  perform order_expire_due(null, 500);

  v_pattern := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits := regexp_replace(coalesce(v_q, ''), '[^0-9]', '', 'g');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'brandSlug', b.slug,
      'brandName', b.name,
      'accent', b.theme ->> 'accent',
      'customerName', o.customer_name,
      'customerWa', o.customer_wa,
      'outletLabel', o.outlet_label,
      'itemCount', coalesce((o.pricing ->> 'itemCount')::integer, 0),
      'total', o.total,
      'pickupMode', o.pickup_mode,
      'pickupAt', o.pickup_at,
      'createdAt', o.created_at,
      'needsRefund', o.needs_refund
    )
    order by
      case when p_filter = 'aktif' then o.pickup_at end asc nulls last,
      o.created_at desc
  ), '[]'::jsonb)
  into v_orders
  from (
    select * from orders x
    where (
        case p_filter
          when 'aktif' then x.status in ('menunggu_konfirmasi', 'antrian', 'diproses')
          when 'bayar' then x.status = 'menunggu_pembayaran'
          when 'selesai' then x.status = 'selesai'
          when 'batal' then x.status in ('dibatalkan', 'kedaluwarsa')
          when 'refund' then x.needs_refund
          else true
        end
      )
      and (
        v_q is null
        or x.id ilike v_pattern
        or x.customer_name ilike v_pattern
        or (v_digits <> '' and x.customer_wa like '%' || regexp_replace(v_digits, '^0', '') || '%')
      )
    order by
      case when p_filter = 'aktif' then x.pickup_at end asc nulls last,
      x.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) o
  join brands b on b.id = o.brand_id;

  select jsonb_build_object(
    'aktif', count(*) filter (where status in ('menunggu_konfirmasi', 'antrian', 'diproses')),
    'bayar', count(*) filter (where status = 'menunggu_pembayaran'),
    'selesai', count(*) filter (where status = 'selesai'),
    'batal', count(*) filter (where status in ('dibatalkan', 'kedaluwarsa')),
    'refund', count(*) filter (where needs_refund)
  )
  into v_counts
  from orders;

  return jsonb_build_object('orders', v_orders, 'counts', v_counts);
end;
$$;

create or replace function public.admin_order_events(p_id text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'fromStatus', e.from_status,
    'toStatus', e.to_status,
    'actor', e.actor,
    'note', e.note,
    'createdAt', e.created_at
  ) order by e.created_at, e.id), '[]'::jsonb)
  from order_events e
  where e.order_id = p_id;
$$;

-- Admin menandai refund sudah dikirim ke customer. Null bila pesanan tidak ada.
create or replace function public.admin_order_refund_done(p_id text, p_actor text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_id for update;
  if not found then
    return null;
  end if;
  if v_order.needs_refund then
    update orders set needs_refund = false where id = p_id returning * into v_order;
    insert into order_events (order_id, from_status, to_status, actor, note)
    values (p_id, v_order.status, v_order.status, p_actor, 'Refund ke customer sudah dikirim');
  end if;
  return order_json(v_order);
end;
$$;

-- -----------------------------------------------------------------------------
-- Brand, fee, dan promo
-- -----------------------------------------------------------------------------

create or replace function public.admin_brand_json(b public.brands)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'slug', b.slug,
    'name', b.name,
    'logoUrl', b.logo_url,
    'theme', b.theme,
    'orderPrefix', b.order_prefix,
    'feeRules', b.fee_rules,
    'outletMode', b.outlet_mode,
    'splitMode', b.split_mode,
    'maxItemsPerOrder', b.max_items_per_order,
    'importer', b.importer,
    'isActive', b.is_active,
    'sortOrder', b.sort_order,
    'productCount', (select count(*) from products p where p.brand_id = b.id and p.is_active and p.is_visible),
    'outletCount', (select count(*) from outlets o where o.brand_id = b.id and o.is_active),
    'promoCount', (select count(*) from promos pr where pr.brand_id = b.id and pr.is_active)
  );
$$;

create or replace function public.admin_brands_list()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(admin_brand_json(b) order by b.sort_order, b.name), '[]'::jsonb) from brands b;
$$;

-- Satu brand beserta semua promonya (termasuk yang nonaktif). Id produk promo = id sumber.
create or replace function public.admin_brand_get(p_slug text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when b.id is null then null else
    admin_brand_json(b) || jsonb_build_object(
      'promos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'level', p.level, 'type', p.type, 'value', p.value,
          'scope', p.scope, 'appliesTo', p.applies_to, 'maxDiscount', p.max_discount,
          'minSubtotal', p.min_subtotal, 'minQty', p.min_qty, 'maxQty', p.max_qty,
          'maxUsesPerOrder', p.max_uses_per_order, 'maxUnits', p.max_units,
          'productIds', (select jsonb_agg(pr.external_id order by pr.name) from products pr where pr.id = any(p.product_ids)),
          'productNames', (select jsonb_agg(pr.name order by pr.name) from products pr where pr.id = any(p.product_ids)),
          'active', p.is_active, 'startsAt', p.starts_at, 'endsAt', p.ends_at
        ) order by p.sort_order, p.created_at), '[]'::jsonb)
        from promos p where p.brand_id = b.id
      )
    )
  end
  from (select 1) x
  left join brands b on b.slug = p_slug;
$$;

/*
  Mengubah pengaturan brand. p_patch hanya berisi field yang diubah:
  name, logoUrl, accent, feeRules, splitMode, maxItemsPerOrder, isActive, sortOrder.
  Validasi isi (skema) dilakukan kode server; constraint tabel jadi pengaman terakhir.
*/
create or replace function public.admin_brand_update(p_slug text, p_patch jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_brand brands%rowtype;
begin
  update brands set
    name = case when p_patch ? 'name' then p_patch ->> 'name' else name end,
    logo_url = case when p_patch ? 'logoUrl' then nullif(p_patch ->> 'logoUrl', '') else logo_url end,
    theme = case when p_patch ? 'accent' then jsonb_set(theme, '{accent}', to_jsonb(p_patch ->> 'accent')) else theme end,
    fee_rules = case when p_patch ? 'feeRules' then p_patch -> 'feeRules' else fee_rules end,
    split_mode = case when p_patch ? 'splitMode' then p_patch ->> 'splitMode' else split_mode end,
    max_items_per_order = case when p_patch ? 'maxItemsPerOrder' then (p_patch ->> 'maxItemsPerOrder')::integer else max_items_per_order end,
    is_active = case when p_patch ? 'isActive' then (p_patch ->> 'isActive')::boolean else is_active end,
    sort_order = case when p_patch ? 'sortOrder' then (p_patch ->> 'sortOrder')::integer else sort_order end
  where slug = p_slug
  returning * into v_brand;
  if not found then
    return null;
  end if;
  return admin_brand_json(v_brand);
end;
$$;

/*
  Menyimpan promo (baru bila id kosong). productIds = id sumber produk.
  Hasil: { ok: true, id } atau { ok: false, error: 'BRAND_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'PROMO_NOT_FOUND' }.
*/
create or replace function public.admin_promo_save(p_brand text, p_promo jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_brand_id uuid;
  v_ids uuid[];
  v_wanted text[];
  v_id uuid;
begin
  select id into v_brand_id from brands where slug = p_brand;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BRAND_NOT_FOUND');
  end if;

  if p_promo -> 'productIds' is not null and jsonb_typeof(p_promo -> 'productIds') = 'array' then
    select array_agg(x) into v_wanted from jsonb_array_elements_text(p_promo -> 'productIds') x;
    select array_agg(id) into v_ids from products where brand_id = v_brand_id and external_id = any (v_wanted);
    if coalesce(cardinality(v_ids), 0) <> coalesce(cardinality(v_wanted), 0) then
      return jsonb_build_object('ok', false, 'error', 'PRODUCT_NOT_FOUND');
    end if;
  end if;

  if nullif(p_promo ->> 'id', '') is null then
    insert into promos (
      brand_id, name, level, type, value, scope, applies_to, max_discount, min_subtotal,
      min_qty, max_qty, max_uses_per_order, max_units, product_ids, is_active, starts_at, ends_at, sort_order
    )
    values (
      v_brand_id, p_promo ->> 'name', p_promo ->> 'level', p_promo ->> 'type', (p_promo ->> 'value')::integer,
      coalesce(p_promo ->> 'scope', 'all_items'), coalesce(p_promo ->> 'appliesTo', 'subtotal'),
      (p_promo ->> 'maxDiscount')::integer, (p_promo ->> 'minSubtotal')::integer,
      (p_promo ->> 'minQty')::integer, (p_promo ->> 'maxQty')::integer,
      (p_promo ->> 'maxUsesPerOrder')::integer, (p_promo ->> 'maxUnits')::integer,
      v_ids, coalesce((p_promo ->> 'active')::boolean, true),
      (p_promo ->> 'startsAt')::timestamptz, (p_promo ->> 'endsAt')::timestamptz,
      coalesce((select max(sort_order) + 10 from promos where brand_id = v_brand_id), 10)
    )
    returning id into v_id;
  else
    update promos set
      name = p_promo ->> 'name',
      level = p_promo ->> 'level',
      type = p_promo ->> 'type',
      value = (p_promo ->> 'value')::integer,
      scope = coalesce(p_promo ->> 'scope', 'all_items'),
      applies_to = coalesce(p_promo ->> 'appliesTo', 'subtotal'),
      max_discount = (p_promo ->> 'maxDiscount')::integer,
      min_subtotal = (p_promo ->> 'minSubtotal')::integer,
      min_qty = (p_promo ->> 'minQty')::integer,
      max_qty = (p_promo ->> 'maxQty')::integer,
      max_uses_per_order = (p_promo ->> 'maxUsesPerOrder')::integer,
      max_units = (p_promo ->> 'maxUnits')::integer,
      product_ids = v_ids,
      is_active = coalesce((p_promo ->> 'active')::boolean, true),
      starts_at = (p_promo ->> 'startsAt')::timestamptz,
      ends_at = (p_promo ->> 'endsAt')::timestamptz
    where id = (p_promo ->> 'id')::uuid and brand_id = v_brand_id
    returning id into v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PROMO_NOT_FOUND');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_promo_set_active(p_brand text, p_id uuid, p_active boolean)
returns boolean
language sql
set search_path = public
as $$
  with changed as (
    update promos p set is_active = p_active
    from brands b
    where p.id = p_id and b.id = p.brand_id and b.slug = p_brand
    returning 1
  )
  select exists (select 1 from changed);
$$;

create or replace function public.admin_promo_delete(p_brand text, p_id uuid)
returns boolean
language sql
set search_path = public
as $$
  with removed as (
    delete from promos p
    using brands b
    where p.id = p_id and b.id = p.brand_id and b.slug = p_brand
    returning 1
  )
  select exists (select 1 from removed);
$$;

-- -----------------------------------------------------------------------------
-- Pengaturan situs
-- -----------------------------------------------------------------------------

-- p_patch digabung ke pengaturan yang ada (kunci tidak disebut = tidak berubah).
create or replace function public.admin_settings_update(p_patch jsonb)
returns jsonb
language sql
set search_path = public
as $$
  update site_settings set settings = settings || p_patch where id = 1 returning settings;
$$;

-- -----------------------------------------------------------------------------
-- Produk
-- -----------------------------------------------------------------------------

-- Daftar produk satu brand (untuk menyembunyikan menu dan memilih produk promo).
create or replace function public.admin_products_list(p_brand text, p_query text default null, p_limit integer default 300)
returns jsonb
language sql
stable
set search_path = public
as $$
  with b as (select id from brands where slug = p_brand),
  q as (
    select '%' || replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'externalId', x.external_id,
    'name', x.name,
    'category', x.category,
    'isVisible', x.is_visible,
    'isActive', x.is_active,
    'minPrice', x.min_price,
    'maxPrice', x.max_price
  ) order by x.category_sort, x.sort_order, x.name), '[]'::jsonb)
  from (
    select p.id, p.external_id, p.name, c.name as category, c.sort_order as category_sort, p.sort_order,
           p.is_visible, p.is_active,
           (select min(pli.base_price) from price_list_items pli where pli.product_id = p.id) as min_price,
           (select max(pli.base_price) from price_list_items pli where pli.product_id = p.id) as max_price
    from products p
    join b on b.id = p.brand_id
    join categories c on c.id = p.category_id
    cross join q
    where p.name ilike q.pattern or c.name ilike q.pattern
    order by c.sort_order, p.sort_order, p.name
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)
  ) x;
$$;

create or replace function public.admin_product_set_visible(p_brand text, p_id uuid, p_visible boolean)
returns boolean
language sql
set search_path = public
as $$
  with changed as (
    update products p set is_visible = p_visible
    from brands b
    where p.id = p_id and b.id = p.brand_id and b.slug = p_brand
    returning 1
  )
  select exists (select 1 from changed);
$$;

-- -----------------------------------------------------------------------------
-- Hak akses: hanya service_role.
-- -----------------------------------------------------------------------------

revoke execute on function public.admin_orders_list(text, text, integer) from public;
revoke execute on function public.admin_order_events(text) from public;
revoke execute on function public.admin_order_refund_done(text, text) from public;
revoke execute on function public.admin_brand_json(public.brands) from public;
revoke execute on function public.admin_brands_list() from public;
revoke execute on function public.admin_brand_get(text) from public;
revoke execute on function public.admin_brand_update(text, jsonb) from public;
revoke execute on function public.admin_promo_save(text, jsonb) from public;
revoke execute on function public.admin_promo_set_active(text, uuid, boolean) from public;
revoke execute on function public.admin_promo_delete(text, uuid) from public;
revoke execute on function public.admin_settings_update(jsonb) from public;
revoke execute on function public.admin_products_list(text, text, integer) from public;
revoke execute on function public.admin_product_set_visible(text, uuid, boolean) from public;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_orders_list(text, text, integer)',
    'public.admin_order_events(text)',
    'public.admin_order_refund_done(text, text)',
    'public.admin_brand_json(public.brands)',
    'public.admin_brands_list()',
    'public.admin_brand_get(text)',
    'public.admin_brand_update(text, jsonb)',
    'public.admin_promo_save(text, jsonb)',
    'public.admin_promo_set_active(text, uuid, boolean)',
    'public.admin_promo_delete(text, uuid)',
    'public.admin_settings_update(jsonb)',
    'public.admin_products_list(text, text, integer)',
    'public.admin_product_set_visible(text, uuid, boolean)'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end;
$$;
