-- Foto produk: bila produk punya foto di R2 (image_key), menu memakai alamat /foto/<key>
-- yang dilayani website sendiri; selain itu tetap memakai alamat foto dari sumber data.
-- Hanya dua baris yang berubah dari versi sebelumnya (kolom image_key dan imageUrl).

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
    select p.id, p.external_id, p.name, p.description, p.image_source_url, p.image_key, p.sort_order,
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
        'imageUrl', case when prod.image_key is not null then '/foto/' || prod.image_key else prod.image_source_url end,
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
