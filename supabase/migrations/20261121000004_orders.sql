-- Tahap 3: pesanan.
-- Semua akses lewat fungsi di bawah, hanya untuk service_role (server website).
-- Aturan siapa boleh mengubah status ke mana ada di kode (src/core/orders/status.ts);
-- database memastikan perubahan atomik: status hanya berubah bila status saat ini masih
-- salah satu status asal yang diizinkan, dan setiap perubahan dicatat di order_events.

alter table public.orders
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_message_id bigint;

-- Nomor WA admin, QRIS, dan batas waktu bayar (bisa diubah dari admin nanti).
update public.site_settings
set settings = jsonb_set(settings, '{whatsappNumber}', '"6287793420768"')
where id = 1 and coalesce(settings ->> 'whatsappNumber', '') = '';

update public.site_settings
set settings = jsonb_set(
  settings,
  '{qrisPayload}',
  '"00020101021126610014COM.GO-JEK.WWW01189360091435771140150210G5771140150303UMI27570011ID.DANA.WWW011893600915083380671102098338067110303UMI51440014ID.CO.QRIS.WWW0215ID10253747967000303UMI5204573253033605802ID5910Cimatix_id6008SIDOARJO61056125262070703A016304F702"'
)
where id = 1 and coalesce(settings ->> 'qrisPayload', '') = '';

update public.site_settings
set settings = jsonb_set(settings, '{paymentExpiryMinutes}', '60')
where id = 1 and settings -> 'paymentExpiryMinutes' is null;

create or replace function public.site_settings_get()
returns jsonb
language sql
stable
set search_path = public
as $$
  select settings from site_settings where id = 1;
$$;

-- Bentuk JSON satu pesanan (lihat OrderRecordSchema di src/core/orders/record.ts).
create or replace function public.order_json(o public.orders)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'brand', (
      select jsonb_build_object('slug', b.slug, 'name', b.name, 'accent', b.theme ->> 'accent')
      from brands b where b.id = o.brand_id
    ),
    'outletCode', (select ot.external_code from outlets ot where ot.id = o.outlet_id),
    'outletLabel', o.outlet_label,
    'customerName', o.customer_name,
    'customerWa', o.customer_wa,
    'pickupMode', o.pickup_mode,
    'pickupAt', o.pickup_at,
    'items', o.items,
    'pricing', o.pricing,
    'subtotal', o.subtotal,
    'discount', o.discount,
    'fee', o.fee,
    'total', o.total,
    'cancellationReason', o.cancellation_reason,
    'needsRefund', o.needs_refund,
    'expiresAt', o.expires_at,
    'paidAt', o.paid_at,
    'createdAt', o.created_at,
    'telegram', case
      when o.telegram_message_id is not null
      then jsonb_build_object('chatId', o.telegram_chat_id, 'messageId', o.telegram_message_id)
    end
  );
$$;

-- Pesanan belum dibayar yang lewat batas waktu menjadi kedaluwarsa.
-- Dipanggil setiap kali pesanan dibaca/diubah, dan oleh cron untuk sisanya.
create or replace function public.order_expire_due(p_id text default null, p_limit integer default 500)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select id from orders
    where status = 'menunggu_pembayaran'
      and expires_at <= now()
      and (p_id is null or id = p_id)
    order by expires_at
    limit greatest(1, least(p_limit, 5000))
    for update skip locked
  ),
  changed as (
    update orders o set status = 'kedaluwarsa'
    from due where o.id = due.id
    returning o.id
  ),
  logged as (
    insert into order_events (order_id, from_status, to_status, actor, note)
    select id, 'menunggu_pembayaran', 'kedaluwarsa', 'system', 'Batas waktu pembayaran habis'
    from changed
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

/*
  Membuat pesanan. Harga dan isi sudah dihitung server; fungsi ini menyusun ID dari prefix brand,
  menolak bila customer punya terlalu banyak pesanan yang belum dibayar, lalu menyimpan.
  Hasil: { ok: true, order } atau { ok: false, error: 'ID_TAKEN' | 'BRAND_NOT_FOUND' | 'OUTLET_NOT_FOUND' | 'TOO_MANY_PENDING' }.
*/
create or replace function public.order_create(p_order jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_brand brands%rowtype;
  v_outlet_id uuid;
  v_id text;
  v_pending integer;
  v_order orders%rowtype;
begin
  select * into v_brand from brands where slug = p_order ->> 'brandSlug';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BRAND_NOT_FOUND');
  end if;

  if p_order ->> 'outletCode' is not null then
    select id into v_outlet_id from outlets
    where brand_id = v_brand.id and external_code = p_order ->> 'outletCode';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'OUTLET_NOT_FOUND');
    end if;
  end if;

  perform order_expire_due(null, 200);
  select count(*) into v_pending from orders
  where customer_wa = p_order ->> 'customerWa'
    and status = 'menunggu_pembayaran'
    and created_at > now() - interval '1 hour';
  if v_pending >= 3 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_PENDING');
  end if;

  v_id := v_brand.order_prefix || '-' || (p_order ->> 'idSuffix');

  insert into orders (
    id, brand_id, outlet_id, outlet_label, customer_name, customer_wa,
    pickup_mode, pickup_at, items, pricing, subtotal, discount, fee, total,
    access_token_hash, expires_at
  )
  values (
    v_id, v_brand.id, v_outlet_id, p_order ->> 'outletLabel', p_order ->> 'customerName', p_order ->> 'customerWa',
    p_order ->> 'pickupMode', (p_order ->> 'pickupAt')::timestamptz, p_order -> 'items', p_order -> 'pricing',
    (p_order ->> 'subtotal')::integer, (p_order ->> 'discount')::integer, (p_order ->> 'fee')::integer, (p_order ->> 'total')::integer,
    p_order ->> 'accessTokenHash', (p_order ->> 'expiresAt')::timestamptz
  )
  on conflict (id) do nothing
  returning * into v_order;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ID_TAKEN');
  end if;

  insert into order_events (order_id, from_status, to_status, actor, note)
  values (v_id, null, v_order.status, 'customer', 'Pesanan dibuat');

  return jsonb_build_object('ok', true, 'order', order_json(v_order));
end;
$$;

-- Membaca pesanan. Dengan p_token_hash: hanya bila token cocok (akses customer).
-- Tanpa token: hanya dipanggil server untuk admin/Telegram.
create or replace function public.order_get(p_id text, p_token_hash text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  perform order_expire_due(p_id);
  select * into v_order from orders where id = p_id;
  if not found or (p_token_hash is not null and v_order.access_token_hash <> p_token_hash) then
    return null;
  end if;
  return order_json(v_order);
end;
$$;

/*
  Mengubah status secara atomik.
  p_from: status asal yang diizinkan untuk perubahan ini (dihitung dari aturan di kode).
  Hasil: null bila pesanan tidak ada / token salah, selain itu
  { changed: boolean, conflict: boolean, from: status sebelumnya, order }.
  Sudah di status tujuan = tidak berubah, bukan konflik (klik dobel aman).
*/
create or replace function public.order_transition(
  p_id text,
  p_to text,
  p_from text[],
  p_actor text,
  p_note text default null,
  p_token_hash text default null,
  p_cancellation_reason text default null,
  p_needs_refund boolean default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_from text;
begin
  perform order_expire_due(p_id);
  select * into v_order from orders where id = p_id for update;
  if not found or (p_token_hash is not null and v_order.access_token_hash <> p_token_hash) then
    return null;
  end if;

  v_from := v_order.status;
  if v_from = p_to then
    return jsonb_build_object('changed', false, 'conflict', false, 'from', v_from, 'order', order_json(v_order));
  end if;
  if not (v_from = any (p_from)) then
    return jsonb_build_object('changed', false, 'conflict', true, 'from', v_from, 'order', order_json(v_order));
  end if;

  update orders set
    status = p_to,
    paid_at = case when p_to in ('menunggu_konfirmasi', 'antrian') then coalesce(paid_at, now()) else paid_at end,
    cancellation_reason = case when p_to = 'dibatalkan' then coalesce(p_cancellation_reason, cancellation_reason) else cancellation_reason end,
    needs_refund = coalesce(p_needs_refund, needs_refund)
  where id = p_id
  returning * into v_order;

  insert into order_events (order_id, from_status, to_status, actor, note)
  values (p_id, v_from, p_to, p_actor, p_note);

  return jsonb_build_object('changed', true, 'conflict', false, 'from', v_from, 'order', order_json(v_order));
end;
$$;

create or replace function public.order_set_telegram(p_id text, p_chat_id text, p_message_id bigint)
returns void
language sql
set search_path = public
as $$
  update orders set telegram_chat_id = p_chat_id, telegram_message_id = p_message_id where id = p_id;
$$;

-- Hak akses: hanya service_role. Supabase memberi EXECUTE ke anon/authenticated secara default.
revoke execute on function public.site_settings_get() from public;
revoke execute on function public.order_json(public.orders) from public;
revoke execute on function public.order_expire_due(text, integer) from public;
revoke execute on function public.order_create(jsonb) from public;
revoke execute on function public.order_get(text, text) from public;
revoke execute on function public.order_transition(text, text, text[], text, text, text, text, boolean) from public;
revoke execute on function public.order_set_telegram(text, text, bigint) from public;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.site_settings_get()',
    'public.order_json(public.orders)',
    'public.order_expire_due(text, integer)',
    'public.order_create(jsonb)',
    'public.order_get(text, text)',
    'public.order_transition(text, text, text[], text, text, text, text, boolean)',
    'public.order_set_telegram(text, text, bigint)'
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
