-- ══════════════════════════════════════════════════════════════════════════
--  CLUBADMIN BACKFILL HARNESS — the Phase 0a backfill covers exactly the right
--  admins, and nobody else.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and it never touches public.memberships — it exercises the backfill
--  predicate against a temp-table fixture, so it is green whether or not the
--  real backfill has been applied yet.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS
--
-- db/migrations/20260828_clubadmin_right.sql grants 'clubadmin' to every active
-- non-super admin, so the Club Hub Admin portal flip (right: null → 'clubadmin',
-- src/lib/portals.js) strips nobody. The failure that matters has two shapes:
--   (a) an admin who should keep the screen is MISSED — they lose it on deploy;
--   (b) a row that should NOT be touched (a super, a pending admin, a coach) is
--       swept in — either widening access or breaking the supers-are-implicit
--       invariant.
-- Both directions are asserted below.
--
-- ⚠️ WHY A FIXTURE, NOT LIVE ROWS. An additive backfill has a transient effect:
-- once applied to production there is nothing left to back-fill, so a harness
-- that asserted "the backfill changes something on live" would go red the day
-- after it ran. A controlled fixture makes the assertion durable and lets it
-- carry the untouched-row cases the live set may not happen to contain.
--
-- ⚠️ THE PREDICATE BELOW MUST MIRROR THE MIGRATION. This is the same
-- "change one, change both" the app has between ADMIN_RIGHTS and the SQL — the
-- WHERE in pg_temp.apply_backfill() is a copy of the migration's WHERE, against
-- the fixture table instead of public.memberships. If one changes, change both.

begin;

-- ── 0. The fixture: one row of every shape the predicate must judge ────────
create temp table fixture (
  who          text primary key,
  role         text not null,
  status       text not null,
  is_super     boolean not null,
  admin_rights text[]  not null default '{}'
) on commit drop;

insert into fixture (who, role, status, is_super, admin_rights) values
  -- Active non-super admins — MUST gain clubadmin:
  ('a_pitches',   'admin', 'active',  false, '{pitches}'),
  ('a_norights',  'admin', 'active',  false, '{}'),           -- empty-array edge
  -- Active non-super admin that already holds it — MUST NOT duplicate:
  ('a_hasit',     'admin', 'active',  false, '{clubadmin,youth}'),
  -- Supers — MUST stay exactly as they are (implicit-holding invariant):
  ('s_empty',     'admin', 'active',  true,  '{}'),
  ('s_youth',     'admin', 'active',  true,  '{youth}'),
  -- Not-active admins — MUST NOT be touched:
  ('p_pending',   'admin', 'pending', false, '{}'),
  ('x_inactive',  'admin', 'revoked', false, '{}'),
  -- Not an admin at all — MUST NOT be touched:
  ('c_coach',     'coach', 'active',  false, '{}');

-- ── 1. The backfill predicate, byte-for-byte the migration's, on the fixture ─
create function pg_temp.apply_backfill() returns void language plpgsql as $fn$
begin
  update fixture
     set admin_rights = array_append(admin_rights, 'clubadmin')
   where role = 'admin'
     and status = 'active'
     and is_super = false
     and not ('clubadmin' = any(admin_rights));
end
$fn$;

-- ── 2. The assertions — both directions, plus no duplication ───────────────
create function pg_temp.assert_ok() returns void language plpgsql as $fn$
declare
  r fixture;
  missing int;
begin
  -- (a) NOBODY WHO SHOULD KEEP THE SCREEN IS MISSED.
  select count(*) into missing from fixture
   where role = 'admin' and status = 'active' and is_super = false
     and not ('clubadmin' = any(admin_rights));
  if missing <> 0 then
    raise exception
      'CLUBADMIN BACKFILL: % active non-super admin(s) still lack clubadmin. '
      'The portal flip would grey their Club Hub Admin card.', missing;
  end if;

  -- Exact arrays, so a stray extra grant is caught as loudly as a missed one.
  select * into r from fixture where who = 'a_pitches';
  if not (r.admin_rights = array['pitches','clubadmin']) then
    raise exception 'CLUBADMIN BACKFILL: a_pitches is %, expected {pitches,clubadmin}.', r.admin_rights;
  end if;
  select * into r from fixture where who = 'a_norights';
  if not (r.admin_rights = array['clubadmin']) then
    raise exception 'CLUBADMIN BACKFILL: a_norights is %, expected {clubadmin}.', r.admin_rights;
  end if;

  -- No duplication for someone who already held it.
  select * into r from fixture where who = 'a_hasit';
  if not (r.admin_rights = array['clubadmin','youth']) then
    raise exception 'CLUBADMIN BACKFILL: a_hasit is % — a duplicate clubadmin, or a lost right.', r.admin_rights;
  end if;

  -- (b) NOTHING THAT SHOULD BE UNTOUCHED WAS TOUCHED.
  select * into r from fixture where who = 's_empty';
  if not (r.admin_rights = array[]::text[]) then
    raise exception 'CLUBADMIN BACKFILL: super s_empty gained % — supers hold rights implicitly and must stay empty.', r.admin_rights;
  end if;
  select * into r from fixture where who = 's_youth';
  if not (r.admin_rights = array['youth']) then
    raise exception 'CLUBADMIN BACKFILL: super s_youth is %, expected {youth} — supers must be untouched.', r.admin_rights;
  end if;
  select * into r from fixture where who = 'p_pending';
  if not (r.admin_rights = array[]::text[]) then
    raise exception 'CLUBADMIN BACKFILL: pending admin gained % — status=active is part of the gate.', r.admin_rights;
  end if;
  select * into r from fixture where who = 'x_inactive';
  if not (r.admin_rights = array[]::text[]) then
    raise exception 'CLUBADMIN BACKFILL: an inactive admin gained %.', r.admin_rights;
  end if;
  select * into r from fixture where who = 'c_coach';
  if not (r.admin_rights = array[]::text[]) then
    raise exception 'CLUBADMIN BACKFILL: a coach gained % — role=admin is part of the gate.', r.admin_rights;
  end if;

  raise notice 'CLUBADMIN BACKFILL: all checks passed.';
end
$fn$;

-- ── 3. THE CONTROL. Before the backfill, at least one active non-super admin
-- must LACK clubadmin — otherwise "0 lacking" afterwards proves nothing.
do $$
declare n int;
begin
  select count(*) into n from fixture
   where role = 'admin' and status = 'active' and is_super = false
     and not ('clubadmin' = any(admin_rights));
  if n = 0 then
    raise exception
      'CLUBADMIN BACKFILL: control failed — the fixture has no active non-super '
      'admin lacking clubadmin, so the post-backfill assertion would be vacuous.';
  end if;
  raise notice 'control: % active non-super admin(s) lack clubadmin before the backfill.', n;
end $$;

-- ── 4. Run the backfill and assert. Expected: all checks passed. ───────────
select pg_temp.apply_backfill();
select pg_temp.assert_ok();

-- ── 5. IDEMPOTENCY — a second run changes nothing. ─────────────────────────
select pg_temp.apply_backfill();
select pg_temp.assert_ok();

-- ── 6. ⚠️ THE SELF-TEST — inject a straggler and prove the check catches it ─
-- A real active non-super admin created (or missed) between the backfill and
-- the flip has empty rights. assert_ok() must fail on it — if it does not, the
-- "nobody is missed" assertion in part 2 is vacuous.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: CLUBADMIN ...
insert into fixture (who, role, status, is_super, admin_rights)
values ('a_straggler', 'admin', 'active', false, '{}');

do $$
begin
  begin
    perform pg_temp.assert_ok();
    raise exception 'SELF-TEST FAILED: assert_ok() passed with an active non-super admin lacking clubadmin. The assertions are vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end $$;

-- ── 7. Undo everything. The fixture is a temp table (on commit drop) and
-- nothing here touched public.memberships, but the rollback is the contract
-- scripts/db-check.mjs enforces, so it is here.
rollback;
