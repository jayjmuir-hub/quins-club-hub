-- ══════════════════════════════════════════════════════════════════════════
--  EMAIL-CONFIRMED SYNC HARNESS — public.profiles.email_confirmed_at must
--  track auth.users.email_confirmed_at, in both directions.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  The only writes are to ONE auth.users row, chosen at run time, and both
--  the write and its trigger effect are undone by the rollback.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 20260820_profile_email_confirmed.sql mirrors a column out of `auth.users`
-- so the "Waiting for access" list can tell "never opened the confirmation
-- email" apart from "confirmed, and genuinely waiting for an admin". A mirror
-- is only worth anything while it keeps up.
--
-- ⚠️ THE FAILURE THIS GUARDS AGAINST IS SILENT AND LOOKS LIKE THE TRUTH.
-- If the trigger is lost or its WHEN clause is narrowed, the column simply
-- stops moving. Every row keeps whatever it had at backfill time, the query
-- succeeds, the screen renders a confident label, and it is wrong. Nothing
-- errors. That is why part 3 does not check the trigger EXISTS — it makes the
-- database do the work and reads the answer back.
--
-- ⚠️ AND THE OBVIOUS IMPLEMENTATION IS THE BROKEN ONE, which part 4 pins.
-- `on_auth_user_email_updated` fires `AFTER UPDATE OF email ... WHEN
-- (old.email IS DISTINCT FROM new.email)`. Confirming an address does not
-- change the address. Anyone "simplifying" the two triggers into one would
-- reintroduce exactly that, and part 3 alone would still pass if they merged
-- in the other direction.

begin;

-- ── 1. The column is there, and is the right shape ────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name  = 'email_confirmed_at'
     and data_type    = 'timestamp with time zone';
  if n <> 1 then
    raise exception
      'profiles.email_confirmed_at is missing or not timestamptz (found %). '
      'Apply db/migrations/20260820_profile_email_confirmed.sql.', n;
  end if;
end $$;

-- ── 2. `anon` gained nothing ──────────────────────────────────────────────
-- ⚠️ WITH A CONTROL. Asserting only "anon cannot read it" would also pass if
-- the column vanished, or if the privilege lookup were asking the wrong
-- question — so the same call is made for `authenticated`, which MUST be able
-- to read it, and the pair is what proves the check works.
do $$
declare
  anon_can boolean;
  auth_can boolean;
begin
  anon_can := has_column_privilege('anon', 'public.profiles', 'email_confirmed_at', 'SELECT');
  auth_can := has_column_privilege('authenticated', 'public.profiles', 'email_confirmed_at', 'SELECT');
  if anon_can then
    raise exception 'anon can SELECT profiles.email_confirmed_at — it must not.';
  end if;
  if not auth_can then
    raise exception
      'authenticated CANNOT SELECT profiles.email_confirmed_at, so the control '
      'for this check failed and the anon result above proves nothing.';
  end if;
end $$;

-- ── 3. THE REAL TEST: make the database do it ─────────────────────────────
-- Picks any existing login at run time. No id is written into this file —
-- CLAUDE.md rule 9, and a hard-coded id would rot the first time that row went.
do $$
declare
  victim   uuid;
  original timestamptz;
  seen     timestamptz;
  sentinel constant timestamptz := timestamptz '2001-02-03 04:05:06+00';
begin
  select u.id, u.email_confirmed_at
    into victim, original
    from auth.users u
    join public.profiles p on p.id = u.id
   order by u.created_at
   limit 1;

  if victim is null then
    raise exception
      'No auth.users row with a matching profile, so this harness could not '
      'run. That is not a pass.';
  end if;

  -- (a) setting it must reach profiles
  update auth.users set email_confirmed_at = sentinel where id = victim;
  select p.email_confirmed_at into seen from public.profiles p where p.id = victim;
  if seen is distinct from sentinel then
    raise exception
      'Setting auth.users.email_confirmed_at did NOT reach profiles (profiles '
      'holds %, expected %). The mirror is dead and the Waiting for access '
      'list is reporting stale confirmation state.', seen, sentinel;
  end if;

  -- (b) clearing it must reach profiles too. A one-way mirror would pass (a)
  --     and still strand anybody whose confirmation is ever revoked.
  update auth.users set email_confirmed_at = null where id = victim;
  select p.email_confirmed_at into seen from public.profiles p where p.id = victim;
  if seen is not null then
    raise exception
      'Clearing auth.users.email_confirmed_at did NOT reach profiles '
      '(profiles still holds %). The mirror only works one way.', seen;
  end if;

  -- Put the row back explicitly. The rollback below is what actually protects
  -- production, but leaving the restore to it alone would mean a harness run
  -- that aborted mid-way had rewritten a real person's confirmation state.
  update auth.users set email_confirmed_at = original where id = victim;
end $$;

-- ── 4. The old email trigger could NOT have done this ─────────────────────
-- Pins the reason a separate trigger exists, so a future tidy-up that merges
-- them has to delete this assertion on purpose rather than by accident.
do $$
declare
  fires_on_email_confirmed boolean;
begin
  select exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth'
       and c.relname = 'users'
       and not t.tgisinternal
       and t.tgname = 'on_auth_user_email_confirmed'
  ) into fires_on_email_confirmed;

  if not fires_on_email_confirmed then
    raise exception
      'on_auth_user_email_confirmed is gone. on_auth_user_email_updated does '
      'NOT cover this: it is AFTER UPDATE OF email WHEN old.email IS DISTINCT '
      'FROM new.email, and confirming an address does not change the address.';
  end if;
end $$;

-- ⚠️ NOT OPTIONAL. Part 3 really did update a production auth.users row.
-- The update is transactional, so this undoes it — but only if it runs.
rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run on its own afterwards. Expected: 0 rows out of step.
--
--   select count(*) from auth.users u
--     join public.profiles p on p.id = u.id
--    where p.email_confirmed_at is distinct from u.email_confirmed_at;
