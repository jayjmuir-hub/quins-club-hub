-- ══════════════════════════════════════════════════════════════════════════
--  ANON TABLE GRANTS HARNESS — `anon` must hold NO table privilege anywhere
--  in `public`.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and the only write is the deliberately-injected fault in part 3.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 20260814_revoke_anon_table_privileges.sql revoked the Supabase default that
-- made all 23 then-existing tables anon-readable and anon-writable. That
-- migration is a one-off; this is the thing that keeps it true.
--
-- ⚠️ AND IT IS NOT DECORATIVE, BECAUSE THE MIGRATION IS ONLY A PARTIAL FIX.
-- Two default-privilege entries govern new tables in `public`. The one owned by
-- `postgres` was altered; the one owned by `supabase_admin` **could not be** —
-- we are not that role, and it still reads `anon=arwdDxtm/supabase_admin`. So a
-- table created down that path arrives anon-reachable with nothing to say so.
--
-- **This harness is that "something to say so".** It walks every table rather
-- than trusting either default, which is the only form of the check that
-- survives a new table appearing.
--
-- ⚠️ EXPECT THIS FILE TO BE RED UNTIL THE MIGRATION IS APPLIED. A red run here
-- is a statement about PRODUCTION, not about your branch — see
-- claude/runbooks/db-harnesses.md.

begin;

-- ── 1. The check, as a temp function so part 3 can run it twice ────────────
--
-- pg_temp, so it dies with the session and cannot be left on production even if
-- the rollback at the bottom were somehow skipped.

create function pg_temp.check_anon_table_grants() returns void language plpgsql as $fn$
declare
  offender  record;
  priv      text;
  n_tables  int;
begin
  -- ── 1a. THE CONTROL, AND IT COMES FIRST ON PURPOSE ───────────────────────
  --
  -- Every assertion below is of the form "this privilege is ABSENT". A typo in
  -- the role name, the schema name or relkind makes all of them vacuously true
  -- and the file goes green while checking nothing. CLAUDE.md rule 6.
  --
  -- So: prove the walk finds tables at all, and prove a role that SHOULD hold
  -- the privilege still does.

  select count(*) into n_tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

  if n_tables < 20 then
    raise exception
      'ANON GRANTS: only % tables found in `public`. This walk is how every '
      'assertion below is made; if it finds nothing, the file is green and '
      'testing nothing. Expected 24 on 14 Aug 2026.', n_tables;
  end if;

  if not has_table_privilege('authenticated', 'public.players', 'SELECT') then
    raise exception
      'ANON GRANTS: `authenticated` has LOST SELECT on players. The revoke in '
      '20260814_revoke_anon_table_privileges.sql was meant to touch `anon` '
      'ALONE — if it took authenticated with it, the roster is blank for the '
      'entire club and this control is the only thing that would say so.';
  end if;

  if not has_table_privilege('service_role', 'public.players', 'SELECT') then
    raise exception
      'ANON GRANTS: `service_role` has LOST SELECT on players. The edge '
      'functions run as service_role.';
  end if;

  -- ── 1b. No table privilege of any kind, on any table, for `anon` ─────────
  --
  -- ⚠️ has_table_privilege IS THE ONLY HONEST CHECK, and that is the lesson
  -- 20260813_revoke_anon_execute.sql paid for: a named grant and a PUBLIC grant
  -- are independent, and reading either the migration text or one catalogue
  -- column missed the hole in two different directions at once. This asks the
  -- question the app asks, so it cannot be fooled by which route the privilege
  -- arrived down.

  foreach priv in array array['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','TRUNCATE']
  loop
    for offender in
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege('anon', c.oid, priv)
      order by c.relname
    loop
      raise exception
        'ANON GRANTS: `anon` can % public.%. That is the unauthenticated role — '
        'anyone holding the publishable key, which is public by design. It is '
        'restrained today only by RLS policy, which is exactly the arrangement '
        'this repo does not rely on. See '
        'db/migrations/20260814_revoke_anon_table_privileges.sql.',
        priv, offender.relname;
    end loop;
  end loop;

  -- ── 1c. The `postgres` default privilege stays closed ────────────────────
  --
  -- Not a belt-and-braces extra: without this, the revoke above is undone for
  -- every FUTURE table and the harness would not notice until that table
  -- existed. ⚠️ The `supabase_admin` entry is NOT asserted — it could not be
  -- altered, so asserting it would be asserting a known-false thing. 1b is what
  -- catches a table that arrives down that path.

  if exists (
    select 1 from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and d.defaclacl::text like '%anon=%'
  ) then
    raise exception
      'ANON GRANTS: the `postgres` default privilege for tables in `public` '
      'grants to `anon` again. Every table created from here arrives open, and '
      'the per-table check above would only notice once one existed.';
  end if;

  raise notice 'ANON GRANTS: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  ANON GRANTS: all checks passed.

select pg_temp.check_anon_table_grants();


-- ── 3. ⚠️ THE SELF-TEST — inject the exact fault and prove it is caught ────
--
-- The fault is the real thing produced the real way: hand `anon` back a SELECT
-- that Supabase's default privileges would have granted anyway. This is not a
-- simulation — between this line and the rollback, `anon` genuinely can read
-- the players table on production.
--
-- ⚠️ THE ROLLBACK AT THE BOTTOM IS WHAT MAKES THAT ACCEPTABLE, and
-- scripts/db-check.mjs refuses to run any harness here that could commit.
--
-- ⚠️ `players` IS CHOSEN DELIBERATELY over an empty table: it holds real rows,
-- so the injected fault is a real exposure and not a technicality.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: ANON GRANTS: …
-- SELF-TEST FAILED means part 2's green result meant nothing.

grant select on public.players to anon;

do $$
begin
  begin
    perform pg_temp.check_anon_table_grants();
    raise exception 'SELF-TEST FAILED: check_anon_table_grants() passed while `anon` held SELECT on players. The assertions are vacuous — check the role name, the schema name and relkind.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did grant SELECT on production. GRANT is
-- transactional, so this removes it — but only if it runs. If you ran part 3
-- alone, run:
--   revoke select on public.players from anon;

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run this on its own afterwards. Expected: f
--
--   select has_table_privilege('anon', 'public.players', 'SELECT');
