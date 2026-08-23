-- Harness for db/migrations/20260823_storage_usage.sql.
-- Run with `npm run db:check -- storage-usage`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (the 23 Aug lesson: harness the
-- file, not a transcription of it).
begin;

create or replace function public.storage_usage()
returns table(kind text, label text, bytes bigint, objects bigint)
language sql
stable
security definer
set search_path = public
as $$
  select 'database'::text, current_database()::text,
         pg_database_size(current_database()), null::bigint
  where private.is_admin_anywhere()
  union all
  select 'bucket'::text, o.bucket_id::text,
         coalesce(sum((o.metadata->>'size')::bigint), 0), count(*)
    from storage.objects o
   where private.is_admin_anywhere()
   group by o.bucket_id
   order by 1, 2
$$;

revoke all on function public.storage_usage() from public, anon;  -- Supabase grants anon by default; revoke it by name
grant execute on function public.storage_usage() to authenticated;

comment on function public.storage_usage() is
  'Database size and bytes per storage bucket, for admins. See db/migrations/20260823_storage_usage.sql.';

-- 1. An admin sees one database row and at least one bucket row.
do $$
declare _id uuid; n int; b int;
begin
  select profile_id into _id from public.memberships where role = 'admin' and status = 'active' limit 1;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
  select count(*) filter (where kind = 'database'), count(*) filter (where kind = 'bucket')
    into n, b from public.storage_usage();
  reset role;
  if n <> 1 then raise exception '1 FAIL: expected one database row, got %', n; end if;
  if b < 1 then raise exception '1 FAIL: expected bucket rows, got %', b; end if;
  raise notice '1 ok: database row and % bucket rows', b;
end $$;

-- 2. A parent sees nothing at all — not even the database row.
do $$
declare _id uuid; n int;
begin
  select profile_id into _id from public.memberships m
   where role = 'parent' and status = 'active'
     and not exists (select 1 from public.memberships a where a.profile_id = m.profile_id and a.role = 'admin' and a.status = 'active')
   limit 1;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
  select count(*) into n from public.storage_usage();
  reset role;
  if n <> 0 then raise exception '2 FAIL: parent saw % rows', n; end if;
  raise notice '2 ok: parent sees nothing';
end $$;

-- 3. Control for 2: the same query run directly DOES return rows, so an empty
--    result above is the gate and not a broken function.
do $$
declare n int;
begin
  select count(*) into n from storage.objects;
  if n < 1 then raise exception '3 FAIL: storage.objects is empty, test 2 proves nothing'; end if;
  raise notice '3 ok: control sees % objects', n;
end $$;

rollback;
