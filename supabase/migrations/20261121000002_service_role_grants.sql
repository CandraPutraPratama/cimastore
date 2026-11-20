-- =============================================================================
-- Izin tabel untuk server website (service_role).
--
-- Supabase versi baru tidak lagi otomatis memberi hak SELECT/INSERT/UPDATE/DELETE
-- ke service_role untuk tabel yang dibuat lewat migrasi (default privilege hanya
-- "Dxtm"). Akibatnya fungsi catalog_* gagal: "permission denied for table ...".
--
-- Yang diberi hak HANYA service_role (dipakai server dengan secret key).
-- anon & authenticated tetap tanpa hak apa pun; RLS juga tetap aktif.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update, delete on all tables in schema public to service_role';
    execute 'grant usage, select on all sequences in schema public to service_role';
    -- Tabel & sequence yang dibuat migrasi berikutnya (oleh role postgres) ikut mendapat hak yang sama.
    execute 'alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role';
    execute 'alter default privileges for role postgres in schema public grant usage, select on sequences to service_role';
  end if;
end;
$$;
