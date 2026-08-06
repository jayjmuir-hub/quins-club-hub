-- Applied to Supabase as migration `profiles_backfill_split_names`, 6 Aug 2026.
--
-- Backfill first_name/last_name for profiles that predate those columns.
--
-- THE BUG THIS FIXES IS WORTH KEEPING. The backfill in
-- `20260806_profiles_first_and_last_name.sql` was a NO-OP. It ran
--
--     update public.profiles set full_name = full_name
--
-- and the trigger's guard is `new.full_name is distinct from old.full_name`.
-- A value is never distinct from itself, so the trigger correctly declined to
-- do anything. **A self-assignment does not fire a distinct-from check.**
-- The migration reported success and changed nothing; only reading the rows
-- back caught it.
--
-- Writing first/last directly takes the trigger's OTHER branch, which rebuilds
-- full_name from them. That round-trips exactly for every existing row
-- (concat_ws of the split parts reproduces the trimmed original), so no
-- displayed name changes -- verified on all four rows after applying.
update public.profiles
set first_name = coalesce(
      nullif(btrim(regexp_replace(btrim(full_name), '\s+\S+$', '')), ''),
      btrim(full_name)
    ),
    last_name = nullif(btrim(regexp_replace(btrim(full_name), '^.*\s', '')), '')
where nullif(btrim(full_name), '') is not null
  and first_name is null
  and last_name is null;
