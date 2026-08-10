-- ══════════════════════════════════════════════════════════════════════════
--  GRANTS HARNESS — the column ceiling on `profiles`, and what defends it
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: everything runs
--  inside a transaction that ROLLS BACK, and the only write it makes is the
--  deliberately-injected fault in part 3, which is undone with it.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- `claude/state-of-play.md` called table and column grants "the one real gap …
-- and nothing currently checks it". `db/schema/grants.sql` now captures them,
-- which makes drift DIFFABLE. This makes it CHECKABLE — the two are different
-- and the repo has been bitten by the difference: the 7 Aug capture was read as
-- clean and the 9 Aug re-capture found two objects it had missed.
--
-- WHAT IT GUARDS. `profiles.email` is the login identity. RLS authorises the
-- ROW — `profile update own` is USING (id = auth.uid()), and `profile update
-- club admin` is USING private.shares_admin_club(id), so a club admin is
-- authorised against every member row in the club. **Only the column grant
-- limits which FIELDS.** Take the column grants away and both policies become
-- "may rewrite anyone's login email", with no other line of defence.
--
-- ⚠️ READING `policies.sql` WILL NOT TELL YOU THIS. `profile update own` reads
-- as "a member may edit their own profile", full stop. The five-column ceiling
-- on that sentence exists only in the grants.
--
-- ⚠️ PART 3 IS THE POINT OF THE FILE. A check that has never failed is not a
-- check (CLAUDE.md rule 6), and this one cannot be trusted on a green run
-- alone: every assertion below is of the form "this privilege is absent", and
-- a typo'd role name or table name makes all of them vacuously true. So the
-- harness injects the exact fault it exists to catch and proves it fails.
--
-- ⚠️ WHAT HAS AND HAS NOT BEEN RUN, as of 10 Aug 2026. Parts 1 and 2 were run
-- against live and passed. Non-vacuity was proved read-only, by asking the same
-- `has_column_privilege` probe about `phone` — a column that IS granted — and
-- watching it raise. So the mechanism demonstrably distinguishes granted from
-- not, which is the thing a green run cannot tell you on its own.
--
-- **Part 3 has NOT been run against production.** It was written to be run from
-- the SQL editor, where `begin`/`rollback` are a real transaction. It was
-- deliberately not driven through the Supabase MCP tool, whose statement and
-- transaction handling is not guaranteed to keep a mid-batch failure from
-- leaving the GRANT behind — and the GRANT it injects is precisely "any club
-- admin may rewrite any member's login email". Run it in the SQL editor, in one
-- paste, and read part 4.

begin;

-- ── 1. The check itself, as a temp function so it can be run twice ─────────
--
-- pg_temp, so it disappears with the session and cannot be left behind on
-- production even if the rollback below were skipped.

create function pg_temp.check_grants() returns void language plpgsql as $fn$
declare
  granted   text[];
  expected  text[] := array['first_name','full_name','last_name',
                            'name_confirmed_at','phone'];
  stray     text;
  unguarded text;
begin
  -- ── 1a. `email` must not be updatable by a member, by ANY route ──────────
  --
  -- has_column_privilege answers the real question rather than the catalogue
  -- one: it is true if the privilege arrives table-level OR column-level, so
  -- it cannot be fooled by re-granting UPDATE on the whole table.
  if has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE') then
    raise exception
      'GRANTS: `authenticated` can UPDATE profiles.email. This is the login '
      'identity, and `profile update club admin` authorises an admin against '
      'every member row in the club — so this is "any admin may rewrite any '
      E'member\'s login email". See db/schema/grants.sql section 3.';
  end if;

  -- The other two ungranted columns. Less severe than email, still not a
  -- member's to write: `id` is the join to auth.users and to every membership
  -- row, `created_at` is audit.
  if has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE') then
    raise exception 'GRANTS: `authenticated` can UPDATE profiles.id — that is the auth user id.';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE') then
    raise exception 'GRANTS: `authenticated` can UPDATE profiles.created_at.';
  end if;

  -- ── 1b. The five granted columns must STILL be granted ───────────────────
  --
  -- ⚠️ THE OTHER DIRECTION, AND THE ONE THAT WOULD BE MISREAD AS AN RLS BUG.
  -- An ungranted column makes the save fail with a permission error that looks
  -- exactly like a policy refusal, so it gets debugged in policies.sql for an
  -- hour first. Asserting both directions is what stops that.
  select array_agg(att.attname order by att.attname)
    into granted
  from pg_attribute att
  where att.attrelid = 'public.profiles'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', att.attrelid, att.attname, 'UPDATE');

  if granted is distinct from (select array_agg(x order by x) from unnest(expected) x) then
    raise exception
      'GRANTS: the updatable columns of `profiles` are % but should be %. '
      'Adding a column to profiles is a decision, not a formality — see '
      'db/schema/grants.sql section 3.', granted, expected;
  end if;

  -- ── 1c. No column grants anywhere else in `public` ───────────────────────
  --
  -- These five are the only column-level grants in the schema. A new one is
  -- not necessarily wrong, but it is invisible in every other file in
  -- db/schema/ and must be recorded in grants.sql deliberately.
  select c.relname || '.' || att.attname
    into stray
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute att on att.attrelid = c.oid
                       and att.attnum > 0 and not att.attisdropped
  where n.nspname = 'public'
    and att.attacl is not null
    and not (c.relname = 'profiles'
             and att.attname = any(expected))
  limit 1;

  if stray is not null then
    raise exception
      'GRANTS: column-level grant on %, which db/schema/grants.sql does not '
      'record. Re-capture it, or drop it.', stray;
  end if;

  -- ── 1d. Every table in `public` must have RLS enabled ────────────────────
  --
  -- ⚠️ NOT A TIDINESS CHECK. Supabase's default privileges on `public` grant
  -- `anon` full table rights on every table created there — see section 1 of
  -- db/schema/grants.sql. A table without RLS is therefore not "unhardened",
  -- it is readable and writable by anyone with the project URL. The grant that
  -- makes that true is invisible in the CREATE TABLE.
  select c.relname into unguarded
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
  limit 1;

  if unguarded is not null then
    raise exception
      'GRANTS: table `public.%` has RLS DISABLED. Default privileges grant '
      '`anon` full rights on every table in public, so this table is open to '
      'anyone with the project URL.', unguarded;
  end if;

  raise notice 'GRANTS: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  GRANTS: all checks passed.

select pg_temp.check_grants();


-- ── 3. ⚠️ THE SELF-TEST — inject the exact fault and prove it is caught ────
--
-- The fault is one statement: give `authenticated` back the ability to write
-- the login email. This is the real thing, produced the real way, not a
-- simulation of it — and it is undone by the rollback at the bottom.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: GRANTS: …
-- If instead you see SELF-TEST FAILED, the checks in part 1 are vacuous and
-- part 2's green result meant nothing.

grant update (email) on public.profiles to authenticated;

do $$
begin
  begin
    perform pg_temp.check_grants();
    -- Reaching here means the check passed while email was updatable.
    raise exception 'SELF-TEST FAILED: check_grants() passed with UPDATE(email) granted. The assertions are vacuous — check the role and table names.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did grant UPDATE(email) on production. GRANT
-- is transactional in Postgres, so this removes it — but only if it runs.
-- If you ran part 3 alone, run: revoke update (email) on public.profiles from authenticated;

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run this on its own afterwards. Expected: f
--
--   select has_column_privilege('authenticated','public.profiles','email','UPDATE');
