-- =============================================================================
-- Pembatasan percobaan login admin per alamat (kunci sudah di-hash oleh server).
-- 5 kali salah dalam 15 menit -> terkunci 15 menit. Login berhasil menghapus hitungan.
-- =============================================================================

create table if not exists admin_login_attempts (
  key text primary key,
  fails int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
alter table admin_login_attempts enable row level security;

/*
  p_event: 'check' (cek terkunci), 'fail' (catat salah), 'ok' (hapus hitungan).
  Hasil: {locked: bool, retryAfter: detik}.
*/
create or replace function admin_login_gate(p_key text, p_event text, p_max int default 5)
returns jsonb
language plpgsql
as $$
declare
  r admin_login_attempts;
  window_len constant interval := interval '15 minutes';
begin
  if p_key is null or length(p_key) not between 1 and 100 then
    raise exception 'kunci tidak valid';
  end if;

  if p_event = 'ok' then
    delete from admin_login_attempts where key = p_key;
    return jsonb_build_object('locked', false, 'retryAfter', 0);
  end if;

  if p_event = 'fail' then
    insert into admin_login_attempts as a (key, fails, window_start)
    values (p_key, 1, now())
    on conflict (key) do update set
      fails = case when a.window_start < now() - window_len or a.locked_until < now() then 1 else a.fails + 1 end,
      window_start = case when a.window_start < now() - window_len or a.locked_until < now() then now() else a.window_start end,
      locked_until = case
        when a.window_start < now() - window_len or a.locked_until < now() then null
        else a.locked_until end;
    update admin_login_attempts
       set locked_until = now() + window_len
     where key = p_key and fails >= greatest(p_max, 1);
  elsif p_event <> 'check' then
    raise exception 'event tidak dikenal';
  end if;

  select * into r from admin_login_attempts where key = p_key;
  if r.key is not null and r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('locked', true, 'retryAfter', ceil(extract(epoch from r.locked_until - now()))::int);
  end if;
  return jsonb_build_object('locked', false, 'retryAfter', 0);
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.admin_login_gate(text, text, int) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.admin_login_gate(text, text, int) to service_role';
  end if;
end;
$$;
