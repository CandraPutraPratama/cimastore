-- Tahap 4B: kelola katalog dari panel admin.
-- Semua fungsi hanya untuk service_role. Kode server memastikan pemanggilnya admin.

-- -----------------------------------------------------------------------------
-- Brand baru
-- -----------------------------------------------------------------------------

create or replace function public.admin_brand_create(
  p_slug text,
  p_name text,
  p_prefix text,
  p_accent text default '#444444',
  p_outlet_mode text default 'catalog'
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_constraint text;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 40 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SLUG');
  end if;
  if p_prefix is null or p_prefix !~ '^[A-Z]{2,3}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PREFIX');
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_NAME');
  end if;
  if p_accent is null or p_accent !~ '^#[0-9A-Fa-f]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACCENT');
  end if;
  if p_outlet_mode not in ('catalog', 'customer_input') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_OUTLET_MODE');
  end if;

  insert into brands (slug, name, order_prefix, theme, outlet_mode, importer, is_active, sort_order)
  values (
    p_slug, btrim(p_name), p_prefix, jsonb_build_object('accent', p_accent), p_outlet_mode, 'manual', false,
    coalesce((select max(sort_order) from brands), 0) + 1
  );
  return jsonb_build_object('ok', true, 'slug', p_slug);
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  return jsonb_build_object(
    'ok', false,
    'error', case when v_constraint = 'brands_order_prefix_key' then 'PREFIX_TAKEN' else 'SLUG_TAKEN' end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Impor katalog dari CatalogSnapshot (sama persis dengan scripts/db-import.ts,
-- tetapi dijalankan di dalam database supaya bisa dipakai dari website).
--
-- p_options (semua opsional):
--   deactivateMissing  (true)   yang tidak ada di snapshot dinonaktifkan
--   syncOutlets        (true)   outlet dan status produk per outlet ikut disinkronkan
--   rewritePriceLists  (false)  price list berkode sama ditulis ulang isinya
--   replaceOptions     (true)   grup opsi dan relasinya ikut diganti
-- -----------------------------------------------------------------------------

create or replace function public.admin_catalog_import(
  p_brand text,
  p_snapshot jsonb,
  p_source text default 'admin',
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_brand uuid;
  v_deactivate boolean := coalesce((p_options ->> 'deactivateMissing')::boolean, true);
  v_sync_outlets boolean := coalesce((p_options ->> 'syncOutlets')::boolean, true);
  v_rewrite boolean := coalesce((p_options ->> 'rewritePriceLists')::boolean, false);
  v_replace_options boolean := coalesce((p_options ->> 'replaceOptions')::boolean, true);

  v_cat_keep text[];
  v_group_keep text[];
  v_option_keep text[];
  v_product_keep text[];
  v_outlet_keep text[];
  v_pl_keep text[];
  v_write_codes text[];

  v_cat_ins int := 0; v_cat_deact int := 0;
  v_grp_ins int := 0; v_grp_deact int := 0; v_grp_n int := 0;
  v_opt_ins int := 0; v_opt_deact int := 0; v_opt_n int := 0;
  v_prod_ins int := 0; v_prod_deact int := 0;
  v_pog int := 0;
  v_pl_added int := 0; v_pl_removed int := 0; v_items int := 0; v_n int;
  v_out_ins int := 0; v_out_deact int := 0; v_out_n int := 0;
  v_status int := 0;
  v_stats jsonb;
begin
  select id into v_brand from brands where slug = p_brand;
  if v_brand is null then
    return jsonb_build_object('ok', false, 'error', 'BRAND_NOT_FOUND');
  end if;
  if p_snapshot ->> 'brand' is distinct from p_brand then
    return jsonb_build_object('ok', false, 'error', 'SNAPSHOT_BRAND_MISMATCH');
  end if;

  v_cat_keep := array(select c ->> 'id' from jsonb_array_elements(p_snapshot -> 'categories') c);
  v_group_keep := array(select g ->> 'id' from jsonb_array_elements(p_snapshot -> 'optionGroups') g);
  v_option_keep := array(
    select o ->> 'id'
    from jsonb_array_elements(p_snapshot -> 'optionGroups') g, jsonb_array_elements(g -> 'options') o
  );
  v_product_keep := array(select p ->> 'id' from jsonb_array_elements(p_snapshot -> 'products') p);
  v_outlet_keep := array(select o ->> 'code' from jsonb_array_elements(p_snapshot -> 'outlets') o);
  v_pl_keep := array(select pl ->> 'code' from jsonb_array_elements(p_snapshot -> 'priceLists') pl);

  -- 1. Kategori
  with up as (
    insert into categories (brand_id, external_id, name, sort_order, is_active)
    select v_brand, c.value ->> 'id', c.value ->> 'name', (c.ord - 1)::int, true
    from jsonb_array_elements(p_snapshot -> 'categories') with ordinality as c(value, ord)
    on conflict (brand_id, external_id) do update
      set name = excluded.name, sort_order = excluded.sort_order, is_active = true
    returning (xmax = 0) as ins
  )
  select count(*) filter (where ins) into v_cat_ins from up;
  if v_deactivate then
    update categories set is_active = false
    where brand_id = v_brand and is_active and not (external_id = any (v_cat_keep));
    get diagnostics v_cat_deact = row_count;
  end if;

  -- 2. Grup opsi dan opsi
  if v_replace_options then
    v_grp_n := coalesce(jsonb_array_length(p_snapshot -> 'optionGroups'), 0);
    with up as (
      insert into option_groups (brand_id, external_id, name, selection, min_select, max_select, is_active)
      select v_brand, g ->> 'id', g ->> 'name', g ->> 'selection',
             (g ->> 'min')::int, nullif(g ->> 'max', '')::int, true
      from jsonb_array_elements(p_snapshot -> 'optionGroups') g
      on conflict (brand_id, external_id) do update
        set name = excluded.name, selection = excluded.selection,
            min_select = excluded.min_select, max_select = excluded.max_select, is_active = true
      returning (xmax = 0) as ins
    )
    select count(*) filter (where ins) into v_grp_ins from up;
    if v_deactivate then
      update option_groups set is_active = false
      where brand_id = v_brand and is_active and not (external_id = any (v_group_keep));
      get diagnostics v_grp_deact = row_count;
    end if;

    with up as (
      insert into options (brand_id, group_id, external_id, name, price_delta, compare_at_delta,
                           is_default, requires_any_of, sort_order, is_active)
      select v_brand, og.id, o.value ->> 'id', o.value ->> 'name',
             (o.value ->> 'priceDelta')::int,
             nullif(o.value ->> 'compareAtDelta', '')::int,
             coalesce((o.value ->> 'isDefault')::boolean, false),
             case when jsonb_typeof(o.value -> 'requiresAnyOf') = 'array'
                  then array(select jsonb_array_elements_text(o.value -> 'requiresAnyOf')) end,
             (o.ord - 1)::int, true
      from jsonb_array_elements(p_snapshot -> 'optionGroups') g(value)
      cross join lateral jsonb_array_elements(g.value -> 'options') with ordinality as o(value, ord)
      join option_groups og on og.brand_id = v_brand and og.external_id = g.value ->> 'id'
      on conflict (brand_id, external_id) do update
        set group_id = excluded.group_id, name = excluded.name, price_delta = excluded.price_delta,
            compare_at_delta = excluded.compare_at_delta, is_default = excluded.is_default,
            requires_any_of = excluded.requires_any_of, sort_order = excluded.sort_order, is_active = true
      returning (xmax = 0) as ins
    )
    select count(*), count(*) filter (where ins) into v_opt_n, v_opt_ins from up;
    if v_deactivate then
      update options set is_active = false
      where brand_id = v_brand and is_active and not (external_id = any (v_option_keep));
      get diagnostics v_opt_deact = row_count;
    end if;
  end if;

  -- 3. Produk
  with up as (
    insert into products (brand_id, external_id, category_id, name, description, image_source_url, sort_order, is_active)
    select v_brand, p.value ->> 'id', c.id, p.value ->> 'name',
           nullif(p.value ->> 'description', ''), nullif(p.value ->> 'imageUrl', ''), (p.ord - 1)::int, true
    from jsonb_array_elements(p_snapshot -> 'products') with ordinality as p(value, ord)
    join categories c on c.brand_id = v_brand and c.external_id = p.value ->> 'categoryId'
    on conflict (brand_id, external_id) do update
      set category_id = excluded.category_id, name = excluded.name, description = excluded.description,
          image_source_url = excluded.image_source_url, sort_order = excluded.sort_order, is_active = true
    returning (xmax = 0) as ins
  )
  select count(*) filter (where ins) into v_prod_ins from up;
  if v_deactivate then
    update products set is_active = false
    where brand_id = v_brand and is_active and not (external_id = any (v_product_keep));
    get diagnostics v_prod_deact = row_count;
  end if;

  -- 4. Relasi produk - grup opsi
  if v_replace_options then
    delete from product_option_groups pog
    using products p
    where pog.product_id = p.id and p.brand_id = v_brand
      and (v_deactivate or p.external_id = any (v_product_keep));
    insert into product_option_groups (product_id, group_id, sort_order)
    select p.id, og.id, (gid.ord - 1)::int
    from jsonb_array_elements(p_snapshot -> 'products') pr(value)
    cross join lateral jsonb_array_elements_text(pr.value -> 'optionGroupIds') with ordinality as gid(value, ord)
    join products p on p.brand_id = v_brand and p.external_id = pr.value ->> 'id'
    join option_groups og on og.brand_id = v_brand and og.external_id = gid.value;
    get diagnostics v_pog = row_count;
  end if;

  -- 5. Price list: yang sudah ada hanya ditulis ulang bila diminta
  v_write_codes := array(
    select pl ->> 'code' from jsonb_array_elements(p_snapshot -> 'priceLists') pl
    where v_rewrite or not exists (
      select 1 from price_lists x where x.brand_id = v_brand and x.code = pl ->> 'code'
    )
  );
  select count(*) into v_pl_added
  from jsonb_array_elements(p_snapshot -> 'priceLists') pl
  where not exists (select 1 from price_lists x where x.brand_id = v_brand and x.code = pl ->> 'code');

  insert into price_lists (brand_id, code)
  select v_brand, pl ->> 'code' from jsonb_array_elements(p_snapshot -> 'priceLists') pl
  on conflict (brand_id, code) do nothing;

  delete from price_list_items where price_list_id in (
    select id from price_lists where brand_id = v_brand and code = any (v_write_codes));
  delete from price_list_option_deltas where price_list_id in (
    select id from price_lists where brand_id = v_brand and code = any (v_write_codes));

  insert into price_list_items (price_list_id, product_id, base_price, compare_at_price)
  select pl.id, p.id, kv.value::int, nullif(pls.value -> 'compareAtBasePrices' ->> kv.key, '')::int
  from jsonb_array_elements(p_snapshot -> 'priceLists') pls(value)
  join price_lists pl on pl.brand_id = v_brand and pl.code = pls.value ->> 'code' and pl.code = any (v_write_codes)
  cross join lateral jsonb_each_text(pls.value -> 'basePrices') kv
  join products p on p.brand_id = v_brand and p.external_id = kv.key;
  get diagnostics v_n = row_count;
  v_items := v_items + v_n;

  insert into price_list_option_deltas (price_list_id, product_id, option_id, price_delta)
  select pl.id, p.id, op.id, d.value::int
  from jsonb_array_elements(p_snapshot -> 'priceLists') pls(value)
  join price_lists pl on pl.brand_id = v_brand and pl.code = pls.value ->> 'code' and pl.code = any (v_write_codes)
  cross join lateral jsonb_each(pls.value -> 'optionDeltas') pd
  cross join lateral jsonb_each_text(pd.value) d
  join products p on p.brand_id = v_brand and p.external_id = pd.key
  join options op on op.brand_id = v_brand and op.external_id = d.key;
  get diagnostics v_n = row_count;
  v_items := v_items + v_n;

  -- 6. Outlet
  if v_sync_outlets then
    v_out_n := coalesce(jsonb_array_length(p_snapshot -> 'outlets'), 0);
    with up as (
      insert into outlets (brand_id, external_code, name, city, address, lat, lng,
                           open_time, close_time, price_list_id, is_active, last_synced_at)
      select v_brand, o ->> 'code', o ->> 'name', nullif(o ->> 'city', ''), nullif(o ->> 'address', ''),
             (o ->> 'lat')::double precision, (o ->> 'lng')::double precision,
             nullif(o #>> '{hours,open}', '')::time, nullif(o #>> '{hours,close}', '')::time,
             pl.id, true, now()
      from jsonb_array_elements(p_snapshot -> 'outlets') o
      join price_lists pl on pl.brand_id = v_brand and pl.code = o ->> 'priceListCode'
      on conflict (brand_id, external_code) do update
        set name = excluded.name, city = excluded.city, address = excluded.address,
            lat = excluded.lat, lng = excluded.lng, open_time = excluded.open_time,
            close_time = excluded.close_time, price_list_id = excluded.price_list_id,
            is_active = true, last_synced_at = excluded.last_synced_at
      returning (xmax = 0) as ins
    )
    select count(*) filter (where ins) into v_out_ins from up;
    if v_deactivate then
      update outlets set is_active = false
      where brand_id = v_brand and is_active and not (external_code = any (v_outlet_keep));
      get diagnostics v_out_deact = row_count;
    end if;
  end if;

  -- 7. Price list yang tidak dipakai lagi
  delete from price_lists pl
  where pl.brand_id = v_brand
    and not (pl.code = any (v_pl_keep))
    and not exists (select 1 from outlets o where o.price_list_id = pl.id);
  get diagnostics v_pl_removed = row_count;

  -- 8. Status produk per outlet (diganti penuh)
  if v_sync_outlets then
    delete from outlet_product_status ops using outlets o
    where ops.outlet_id = o.id and o.brand_id = v_brand;
    insert into outlet_product_status (outlet_id, product_id, status)
    select o.id, p.id, a ->> 'status'
    from jsonb_array_elements(p_snapshot -> 'availability') a
    join outlets o on o.brand_id = v_brand and o.external_code = a ->> 'outletCode'
    join products p on p.brand_id = v_brand and p.external_id = a ->> 'productId';
    get diagnostics v_status = row_count;
  end if;

  v_stats := jsonb_build_object(
    'categories', jsonb_build_object('upserted', coalesce(jsonb_array_length(p_snapshot -> 'categories'), 0), 'inserted', v_cat_ins, 'deactivated', v_cat_deact),
    'optionGroups', jsonb_build_object('upserted', v_grp_n, 'inserted', v_grp_ins, 'deactivated', v_grp_deact),
    'options', jsonb_build_object('upserted', v_opt_n, 'inserted', v_opt_ins, 'deactivated', v_opt_deact),
    'products', jsonb_build_object('upserted', coalesce(jsonb_array_length(p_snapshot -> 'products'), 0), 'inserted', v_prod_ins, 'deactivated', v_prod_deact),
    'productOptionGroups', v_pog,
    'priceLists', jsonb_build_object('total', coalesce(jsonb_array_length(p_snapshot -> 'priceLists'), 0), 'added', v_pl_added, 'removed', v_pl_removed, 'itemsWritten', v_items),
    'outlets', jsonb_build_object('upserted', v_out_n, 'inserted', v_out_ins, 'deactivated', v_out_deact),
    'outletProductStatus', v_status
  );

  insert into import_runs (brand_id, source, status, stats, finished_at)
  values (v_brand, left(coalesce(p_source, 'admin'), 200), 'success', v_stats, now());

  return jsonb_build_object('ok', true, 'stats', v_stats);
end;
$$;

create or replace function public.admin_import_runs(p_brand text, p_limit integer default 5)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'source', r.source, 'status', r.status, 'stats', r.stats, 'startedAt', r.started_at
  ) order by r.started_at desc), '[]'::jsonb)
  from (
    select ir.* from import_runs ir join brands b on b.id = ir.brand_id
    where b.slug = p_brand
    order by ir.started_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
  ) r;
$$;

-- -----------------------------------------------------------------------------
-- Editor produk
-- -----------------------------------------------------------------------------

create or replace function public.admin_product_get(p_brand text, p_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with b as (select id from brands where slug = p_brand),
  pr as (
    select p.*, c.external_id as category_external_id, c.name as category_name
    from products p join b on b.id = p.brand_id join categories c on c.id = p.category_id
    where p.id = p_id
  )
  select case when not exists (select 1 from pr) then null else jsonb_build_object(
    'product', (select jsonb_build_object(
      'id', id, 'externalId', external_id, 'name', name, 'description', description,
      'imageUrl', image_source_url, 'category', category_name, 'categoryExternalId', category_external_id,
      'isVisible', is_visible, 'isActive', is_active) from pr),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('externalId', c.external_id, 'name', c.name)
                     order by c.sort_order), '[]'::jsonb)
                   from categories c join b on b.id = c.brand_id where c.is_active),
    'priceListCount', (select count(*) from price_lists pl join b on b.id = pl.brand_id),
    'minPrice', (select min(pli.base_price) from price_list_items pli where pli.product_id = p_id),
    'maxPrice', (select max(pli.base_price) from price_list_items pli where pli.product_id = p_id)
  ) end;
$$;

/*
  Tambah atau ubah satu produk.
  p_product: { id?, name, description?, imageUrl?, category, price? }
  Harga hanya boleh diatur bila brand punya paling banyak satu price list
  (harga seragam di semua outlet). Brand dengan harga berbeda per outlet diubah lewat impor.
*/
create or replace function public.admin_product_save(p_brand text, p_product jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_brand uuid;
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p_product ->> 'name', ''));
  v_cat_name text := btrim(coalesce(p_product ->> 'category', ''));
  v_cat uuid;
  v_price integer := nullif(p_product ->> 'price', '')::integer;
  v_pl_count integer;
  v_pl uuid;
begin
  select id into v_brand from brands where slug = p_brand;
  if v_brand is null then
    return jsonb_build_object('ok', false, 'error', 'BRAND_NOT_FOUND');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_NAME');
  end if;
  if char_length(v_cat_name) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CATEGORY');
  end if;
  if v_price is not null and v_price < 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PRICE');
  end if;
  if v_id is null and v_price is null then
    return jsonb_build_object('ok', false, 'error', 'PRICE_REQUIRED');
  end if;
  if v_id is not null and not exists (select 1 from products where id = v_id and brand_id = v_brand) then
    return jsonb_build_object('ok', false, 'error', 'PRODUCT_NOT_FOUND');
  end if;

  select count(*) into v_pl_count from price_lists where brand_id = v_brand;
  if v_price is not null and v_pl_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'MULTI_PRICE_LIST');
  end if;

  select id into v_cat from categories
  where brand_id = v_brand and lower(name) = lower(v_cat_name)
  order by is_active desc limit 1;
  if v_cat is null then
    insert into categories (brand_id, external_id, name, sort_order)
    values (v_brand, 'c-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_cat_name,
            coalesce((select max(sort_order) from categories where brand_id = v_brand), -1) + 1)
    returning id into v_cat;
  else
    update categories set is_active = true where id = v_cat and not is_active;
  end if;

  if v_id is null then
    insert into products (brand_id, category_id, external_id, name, description, image_source_url, sort_order)
    values (
      v_brand, v_cat, 'p-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_name,
      nullif(btrim(coalesce(p_product ->> 'description', '')), ''),
      nullif(btrim(coalesce(p_product ->> 'imageUrl', '')), ''),
      coalesce((select max(sort_order) from products where brand_id = v_brand and category_id = v_cat), -1) + 1
    )
    returning id into v_id;
  else
    update products set
      name = v_name,
      category_id = v_cat,
      description = case when p_product ? 'description' then nullif(btrim(coalesce(p_product ->> 'description', '')), '') else description end,
      image_source_url = case when p_product ? 'imageUrl' then nullif(btrim(coalesce(p_product ->> 'imageUrl', '')), '') else image_source_url end
    where id = v_id;
  end if;

  if v_price is not null then
    select id into v_pl from price_lists where brand_id = v_brand limit 1;
    if v_pl is null then
      insert into price_lists (brand_id, code) values (v_brand, 'default') returning id into v_pl;
    end if;
    insert into price_list_items (price_list_id, product_id, base_price)
    values (v_pl, v_id, v_price)
    on conflict (price_list_id, product_id) do update set base_price = excluded.base_price;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Isi katalog yang sudah ada, untuk mencocokkan baris CSV dengan produk/kategori/outlet lama.
create or replace function public.admin_catalog_context(p_brand text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with b as (select * from brands where slug = p_brand)
  select case when not exists (select 1 from b) then null else jsonb_build_object(
    'outletMode', (select outlet_mode from b),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('externalId', c.external_id, 'name', c.name)
                     order by c.sort_order), '[]'::jsonb)
                   from categories c join b on b.id = c.brand_id),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
                    'externalId', p.external_id, 'name', p.name, 'category', c.name, 'isActive', p.is_active)
                    order by c.sort_order, p.sort_order), '[]'::jsonb)
                 from products p join b on b.id = p.brand_id join categories c on c.id = p.category_id),
    'outletCodes', (select coalesce(jsonb_agg(o.external_code order by o.external_code), '[]'::jsonb)
                    from outlets o join b on b.id = o.brand_id where o.is_active),
    'priceListCodes', (select coalesce(jsonb_agg(pl.code order by pl.code), '[]'::jsonb)
                       from price_lists pl join b on b.id = pl.brand_id)
  ) end;
$$;

revoke execute on function public.admin_catalog_context(text) from public;
revoke execute on function public.admin_brand_create(text, text, text, text, text) from public;
revoke execute on function public.admin_catalog_import(text, jsonb, text, jsonb) from public;
revoke execute on function public.admin_import_runs(text, integer) from public;
revoke execute on function public.admin_product_get(text, uuid) from public;
revoke execute on function public.admin_product_save(text, jsonb) from public;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_brand_create(text, text, text, text, text)',
    'public.admin_catalog_import(text, jsonb, text, jsonb)',
    'public.admin_import_runs(text, integer)',
    'public.admin_catalog_context(text)',
    'public.admin_product_get(text, uuid)',
    'public.admin_product_save(text, jsonb)'
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
