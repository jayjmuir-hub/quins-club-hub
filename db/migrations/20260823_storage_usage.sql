-- Storage usage, for the Club admin tab — 23 Aug 2026.
--
-- Jay asked "won't we run out of storage?" and the answer had to be measured
-- by hand (database 21 MB, photos 2.6 MB, against Pro's 8 GB / 100 GB). This
-- puts the measurement on a screen so the next time the question is asked
-- the answer is already there. Reports only; changes nothing.
--
-- Admin-only: pg_database_size and storage.objects are not for members. The
-- plan's ALLOWANCES are deliberately NOT here — they belong to the screen,
-- where they are labelled as the Pro plan's and can be re-read off the
-- dashboard when the plan changes.

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
