-- ══════════════════════════════════════════════════════════════════════════
--  PHOTO BACKUP HARNESS — who may list the club's storage objects, and who
--  may write the run log.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and the only write is the deliberately-injected fault in part 3.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 20260813_photo_backup.sql added two objects, and the protection on both is a
-- GRANT rather than a policy — which is the kind this repo has twice found it
-- cannot see. db/schema/grants.sql captures them, making drift DIFFABLE; this
-- makes it CHECKABLE, and the two are different.
--
-- ⚠️ AND IT EXISTS BECAUSE ITS ABSENCE WAS A REAL GAP. When the migration was
-- applied on 13 Aug 2026 the grants below WERE verified against live — as
-- ad-hoc SQL in a chat session. So they were checked once, by one person, in a
-- place nobody can re-run. That is the same shape as the failure found the same
-- day, where db/tests/grants.sql had been red for three days because running it
-- was a manual paste.
--
-- WHAT IT GUARDS
--
-- public.photo_backup_list_objects returns object KEYS from storage.objects. A
-- key is the one thing needed to ask storage for a signed URL, and the objects
-- are photographs of children. The function has NO auth.uid() guard of its own,
-- deliberately — the EXECUTE grant is the entire gate, so the grant is the
-- thing that has to be asserted.
--
-- ⚠️ THE DEFAULT IS AGAINST US, WHICH IS WHY A GREEN RUN HERE MEANS SOMETHING.
-- Section 1 of db/schema/grants.sql: Supabase grants EXECUTE on every new
-- function in `public` to `anon` and `authenticated` by default. So this
-- function was anon-callable the instant it was created, and only the REVOKE in
-- the migration closed it. Re-run that migration without the revoke, or restore
-- into a fresh project, and the hole is open again with nothing to say so.

begin;

-- ── 1. The check, as a temp function so part 3 can run it twice ────────────
--
-- pg_temp, so it dies with the session and cannot be left on production even if
-- the rollback at the bottom were somehow skipped.

create function pg_temp.check_photo_backup() returns void language plpgsql as $fn$
declare
  fn_oid   oid;
  settings text[];
  writes   text;
begin
  select p.oid, p.proconfig into fn_oid, settings
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname = 'photo_backup_list_objects';

  if fn_oid is null then
    raise exception
      'PHOTO BACKUP: public.photo_backup_list_objects does not exist. The '
      'backup-player-photos edge function cannot list the source bucket '
      'without it, and pg_net never reads its response — so the mirror would '
      'fail silently. See db/migrations/20260813_photo_backup.sql.';
  end if;

  -- ── 1a. Nobody but service_role may enumerate object keys ────────────────
  if has_function_privilege('anon', fn_oid, 'EXECUTE') then
    raise exception
      'PHOTO BACKUP: `anon` can EXECUTE photo_backup_list_objects. That lists '
      'every object key in any bucket to anyone holding the project URL, and a '
      'key is what storage signs a URL from. These are photographs of children.';
  end if;
  if has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
    raise exception
      'PHOTO BACKUP: `authenticated` can EXECUTE photo_backup_list_objects. Any '
      'signed-in account — including one with zero memberships — could then '
      'enumerate every object key in every bucket.';
  end if;

  -- ── 1b. THE CONTROL. Without this the three assertions above are ALL
  -- satisfied by a typo in the function name, and the file would be green while
  -- checking nothing. CLAUDE.md rule 6, in its cheapest form.
  if not has_function_privilege('service_role', fn_oid, 'EXECUTE') then
    raise exception
      'PHOTO BACKUP: `service_role` has LOST EXECUTE on '
      'photo_backup_list_objects. The mirror cannot list the source bucket, so '
      'every run copies nothing and reports a clean zero.';
  end if;

  -- ── 1c. SECURITY DEFINER with a pinned search_path ───────────────────────
  --
  -- ⚠️ THE THREE-WAY RULE in db/schema/functions.sql: DEFINER always pins. This
  -- one reads storage.objects as its owner, so an unpinned search_path is a
  -- route to making it read something else.
  if not exists (select 1 from pg_proc where oid = fn_oid and prosecdef) then
    raise exception 'PHOTO BACKUP: photo_backup_list_objects is no longer SECURITY DEFINER.';
  end if;
  if settings is null or not (settings @> array['search_path=""']) then
    raise exception
      'PHOTO BACKUP: photo_backup_list_objects has no pinned search_path (proconfig = %). '
      'It is SECURITY DEFINER and reads storage.objects.', settings;
  end if;

  -- ── 1d. The run log is readable by admins and writable by nobody ─────────
  if not has_table_privilege('authenticated', 'public.photo_backup_runs', 'SELECT') then
    raise exception
      'PHOTO BACKUP: `authenticated` cannot SELECT photo_backup_runs. The run '
      'log is the ONLY evidence the mirror is running — pg_cron calls the '
      'function through pg_net, which never reads the response.';
  end if;
  if has_table_privilege('anon', 'public.photo_backup_runs', 'SELECT') then
    raise exception
      'PHOTO BACKUP: `anon` can SELECT photo_backup_runs. This is the first '
      'table in the schema where the Supabase default was revoked rather than '
      'left to RLS alone; if anon is back, that revoke was undone.';
  end if;
  for writes in select unnest(array['INSERT','UPDATE','DELETE']) loop
    if has_table_privilege('authenticated', 'public.photo_backup_runs', writes) then
      raise exception
        'PHOTO BACKUP: `authenticated` can % photo_backup_runs. A run log the '
        'app can write is not evidence.', writes;
    end if;
  end loop;

  -- ── 1e. RLS on, and NO write policy ──────────────────────────────────────
  if not exists (
    select 1 from pg_class
    where oid = 'public.photo_backup_runs'::regclass and relrowsecurity
  ) then
    raise exception 'PHOTO BACKUP: photo_backup_runs has RLS DISABLED.';
  end if;

  select p.policyname into writes
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'photo_backup_runs'
    and p.cmd <> 'SELECT'
  limit 1;
  if writes is not null then
    raise exception
      'PHOTO BACKUP: policy "%" allows a non-SELECT command on photo_backup_runs. '
      'The edge function writes with the service role, which bypasses RLS — the '
      'app needs no write path and must not have one.', writes;
  end if;

  raise notice 'PHOTO BACKUP: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  PHOTO BACKUP: all checks passed.

select pg_temp.check_photo_backup();


-- ── 3. ⚠️ THE SELF-TEST — inject the exact fault and prove it is caught ────
--
-- The fault is one statement, and it is the real thing produced the real way:
-- give `authenticated` back the EXECUTE that Supabase's default privileges
-- would have granted anyway. This is not a simulation of the hole; between this
-- line and the rollback, the hole is genuinely open on production.
--
-- ⚠️ THE ROLLBACK AT THE BOTTOM IS WHAT MAKES THAT ACCEPTABLE, and
-- scripts/db-check.mjs refuses to run any harness in this directory that could
-- commit instead.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: PHOTO BACKUP: ...
-- SELF-TEST FAILED means part 2's green result meant nothing.

grant execute on function public.photo_backup_list_objects(text, text, int) to authenticated;

do $$
begin
  begin
    perform pg_temp.check_photo_backup();
    raise exception 'SELF-TEST FAILED: check_photo_backup() passed while `authenticated` held EXECUTE. The assertions are vacuous — check the function name and the role names.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did grant EXECUTE on production. GRANT is
-- transactional, so this removes it — but only if it runs. If you ran part 3
-- alone, run:
--   revoke execute on function public.photo_backup_list_objects(text, text, int) from authenticated;

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run this on its own afterwards. Expected: f
--
--   select has_function_privilege('authenticated','public.photo_backup_list_objects(text,text,int)','EXECUTE');
