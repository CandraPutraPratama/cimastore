-- Halaman utama perlu tahu apakah menu brand sudah diimpor (McD/Mixue tampil "Segera hadir" sampai ada produk).
-- create or replace mempertahankan grant execute yang sudah ada.
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
        'productCount', (select count(*) from products pr where pr.brand_id = b.id and pr.is_active and pr.is_visible),
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

