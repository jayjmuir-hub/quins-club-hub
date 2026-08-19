-- ══════════════════════════════════════════════════════════════════════════
--  TRUNCATE GRANTS HARNESS — `authenticated` must hold TRUNCATE on NO table
--  in `public`, and no new table may arrive with it.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and the only writes are the two deliberately-injected faults in parts 3
--  and 4.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 20260819_revoke_truncate_from_authenticated.sql took TRUNCATE away from
-- `authenticated` on all 31 tables that had it. That migration is a one-off;
-- this is the thing that keeps it true.
--
-- ⚠️ AND THE PRIVILEGE IT GUARDS IS THE ONE RLS CANNOT HELP WITH. Postgres
-- never applies row security to TRUNCATE — not "the policies allow it", the
-- mechanism does not exist. Every other assertion this repo makes about who
-- can destroy data is enforced twice, by a grant and by a policy. This one is
-- enforced by the grant alone, so this file is the only thing standing behind
-- it.
--
-- ⚠️ IT IS NOT DECORATIVE, BECAUSE THE MIGRATION IS ONLY A PARTIAL FIX.
-- Two default-privilege entries govern new tables in `public`. The one owned
-- by `postgres` was altered; the one owned by `supabase_admin` **could not
-- be** — we are not that role. So a table created down that path arrives
-- truncatable with nothing to say so.
--
-- **This harness is that "something to say so".** Part 1b walks every table
-- rather than trusting either default, which is the only form of the check
-- that survives a new table appearing.
--
-- ⚠️ EXPECT THIS FILE TO BE RED UNTIL THE MIGRATION IS APPLIED. A red run here
-- is a statement about PRODUCTION, not about your branch — see
-- claude/runbooks/db-harnesses.md.

begin;

-- ── 1. The check, as a temp function so parts 3 and 4 can run it again ─────
--
-- pg_temp, so it dies with the session and cannot be left on production even
-- if the rollback at the bottom were somehow skipped.

create function pg_temp.check_truncate_grants() returns void language plpgsql as $fn$
declare
  offender  record;
  n_tables  int;
begin
  -- ── 1a. THE CONTROL, AND IT COMES FIRST ON PURPOSE ───────────────────────
  --
  -- 1b is of the form "this privilege is ABSENT". A typo in the role name, the
  -- schema name or relkind makes it vacuously true and the file goes green
  -- while checking nothing. CLAUDE.md rule 6.
  --
  -- So: prove the walk finds tables at all, and prove the roles that SHOULD
  -- hold privileges still do.

  select count(*) into n_tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

  if n_tables < 30 then
    raise exception
      'TRUNCATE GRANTS: only % tables found in `public`. This walk is how every '
      'assertion below is made; if it finds nothing, the file is green and '
      'testing nothing. Expected 34 on 19 Aug 2026.', n_tables;
  end if;

  -- ⚠️ THE FOUR VERBS THE APP ACTUALLY USES. The failure mode of a sweeping
  -- revoke is taking a neighbour with it, and `revoke truncate on all tables`
  -- is one mistyped word away from `revoke all`. If that happened, the roster
  -- goes blank for the entire club and no TRUNCATE assertion would notice.

  if not has_table_privilege('authenticated', 'public.players', 'SELECT')
     or not has_table_privilege('authenticated', 'public.players', 'INSERT')
     or not has_table_privilege('authenticated', 'public.players', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.players', 'DELETE') then
    raise exception
      'TRUNCATE GRANTS: `authenticated` has LOST one of SELECT/INSERT/UPDATE/'
      'DELETE on players. 20260819_revoke_truncate_from_authenticated.sql was '
      'meant to take TRUNCATE ALONE — if it took a neighbour with it, the '
      'roster is broken for the whole club and this control is the only thing '
      'here that would say so.';
  end if;

  -- ⚠️ service_role KEEPS TRUNCATE, DELIBERATELY — the edge functions run as
  -- it, and it already holds the service key. Asserted so a later sweep
  -- cannot quietly widen into it.

  if not has_table_privilege('service_role', 'public.players', 'TRUNCATE') then
    raise exception
      'TRUNCATE GRANTS: `service_role` has LOST TRUNCATE on players. The 19 Aug '
      'migration names service_role as deliberately untouched; something has '
      'swept wider than it meant to.';
  end if;

  -- ── 1b. No table in `public` gives `authenticated` TRUNCATE ─────────────
  --
  -- ⚠️ has_table_privilege IS THE ONLY HONEST CHECK, and that is the lesson
  -- 20260813_revoke_anon_execute.sql paid for: a named grant and a PUBLIC
  -- grant are independent, and reading either the migration text or one
  -- catalogue column missed the hole in two different directions at once.
  -- This asks the question Postgres itself would ask, so it cannot be fooled
  -- by which route the privilege arrived down.

  for offender in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'TRUNCATE')
    order by c.relname
  loop
    raise exception
      'TRUNCATE GRANTS: `authenticated` can TRUNCATE public.%. RLS does not '
      'filter TRUNCATE — Postgres never applies row security to it — so every '
      'policy on that table is irrelevant to this privilege and any signed-in '
      'member could empty it outright. See '
      'db/migrations/20260819_revoke_truncate_from_authenticated.sql.',
      offender.relname;
  end loop;

  -- ── 1c. The `postgres` default privilege stays closed ────────────────────
  --
  -- Not a belt-and-braces extra: without this, the revoke above is undone for
  -- every FUTURE table and 1b would not notice until that table existed.
  --
  -- ⚠️ The `supabase_admin` entry is NOT asserted — it could not be altered,
  -- so asserting it would be asserting a known-false thing. 1b is what catches
  -- a table that arrives down that path.
  --
  -- ⚠️ aclexplode RATHER THAN A `like '%D%'` ON THE ACL TEXT. In an aclitem
  -- `d` is DELETE and `D` is TRUNCATE; a case-insensitive match, or a match
  -- against the grantor half after the slash, silently confuses the two.

  if exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'TRUNCATE'
  ) then
    raise exception
      'TRUNCATE GRANTS: the `postgres` default privilege for tables in `public` '
      'grants TRUNCATE to `authenticated` again. Every table created from here '
      'arrives truncatable, and the per-table check above would only notice '
      'once one existed.';
  end if;

  raise notice 'TRUNCATE GRANTS: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  TRUNCATE GRANTS: all checks passed.

select pg_temp.check_truncate_grants();


-- ── 3. ⚠️ SELF-TEST ONE — the per-table check (1b) ─────────────────────────
--
-- The fault is the real thing produced the real way: hand `authenticated` back
-- the TRUNCATE that Supabase's default privileges would have granted anyway.
-- This is not a simulation — between this line and the rollback, any signed-in
-- member genuinely could empty the players table on production.
--
-- ⚠️ THE ROLLBACK AT THE BOTTOM IS WHAT MAKES THAT ACCEPTABLE, and
-- scripts/db-check.mjs refuses to run any harness here that could commit.
--
-- ⚠️ `players` IS CHOSEN DELIBERATELY over an empty table: it holds real rows,
-- so the injected fault is a real exposure and not a technicality.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: TRUNCATE GRANTS: …

grant truncate on public.players to authenticated;

do $$
begin
  begin
    perform pg_temp.check_truncate_grants();
    raise exception 'SELF-TEST FAILED: check_truncate_grants() passed while `authenticated` held TRUNCATE on players. The per-table assertion is vacuous — check the role name, the schema name and relkind.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;

-- ⚠️ PUT IT BACK, AND PROVE THE INJECTION WAS THE CAUSE. Without this the file
-- would be claiming a green-to-red transition it never demonstrated — the
-- check could have been failing for some unrelated reason all along. It also
-- has to come out before part 4, which tests a different assertion and would
-- otherwise be caught by this one first.

revoke truncate on public.players from authenticated;
select pg_temp.check_truncate_grants();


-- ── 4. ⚠️ SELF-TEST TWO — the default-privilege check (1c) ─────────────────
--
-- A separate assertion needs its own injected fault; part 3 says nothing about
-- whether 1c works. This is the fault that matters most in the long run,
-- because it is invisible: it changes no existing table, so 1b stays green
-- while every table created afterwards arrives open.

alter default privileges for role postgres in schema public
  grant truncate on tables to authenticated;

do $$
begin
  begin
    perform pg_temp.check_truncate_grants();
    raise exception 'SELF-TEST FAILED: check_truncate_grants() passed while the `postgres` default privilege granted TRUNCATE to `authenticated`. Part 1c is vacuous — check defaclobjtype, the grantor role, and that aclexplode names the privilege TRUNCATE.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 5. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Parts 3 and 4 really did grant on production. GRANT and
-- ALTER DEFAULT PRIVILEGES are both transactional, so this removes them — but
-- only if it runs. If you ran part 3 or 4 alone, run:
--   revoke truncate on public.players from authenticated;
--   alter default privileges for role postgres in schema public
--     revoke truncate on tables from authenticated;

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run these on their own afterwards. Expected: f, then 0.
--
--   select has_table_privilege('authenticated', 'public.players', 'TRUNCATE');
--
--   select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r'
--      and has_table_privilege('authenticated', c.oid, 'TRUNCATE');
