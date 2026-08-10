-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — a PENDING coach must not be able to edit anything
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK. No test user, membership or
--  event survives it, and it can be re-run as often as you like.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. `private.can_see_team` has always carried
-- `m.status = 'active'`; `private.can_edit_team` did not, until the migration
-- db/migrations/20260810_can_edit_team_status.sql. Thirteen policies are built
-- on can_edit_team — events, players, player_contacts, player_parents,
-- attendance, one arm of `avail read`, the availability writes and the
-- player-photo storage policy — so a pending coach could create fixtures,
-- delete children, read parent phone numbers and upload player photographs.
--
-- ⚠️ AS `postgres` (the owner) RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing. That is the
-- easiest false green available here, and it is why the fault injection at the
-- bottom matters more than the assertions above it.
--
-- ⚠️ THIS WAS LATENT, NOT LIVE. Nothing in the app creates a pending STAFF
-- membership — request_access creates pending PARENT rows. Every membership in
-- the database was status='active' when this was written. The harness inserts
-- the pending staff row by hand precisely because the app cannot.

begin;

-- ── A pending coach, and a team with something in it ──────────────────────
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('cee00000-0000-4000-8000-00000000c0ac', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'pending.coach@example.invalid', now(),
        '{}'::jsonb, now(), now());

insert into profiles (id, club_id, full_name, email)
values ('cee00000-0000-4000-8000-00000000c0ac',
        '00000000-0000-0000-0000-0000000000ad', 'Pending Coach',
        'pending.coach@example.invalid')
on conflict (id) do nothing;

-- The squad this person is PENDING staff on.
create temporary table _t on commit drop as
select id as team_id, club_id from teams order by sort_order limit 1;

insert into memberships (profile_id, club_id, team_id, role, status)
select 'cee00000-0000-4000-8000-00000000c0ac', club_id, team_id, 'coach', 'pending'
from _t;

-- ── Become that person. Everything below is evaluated under RLS ───────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"cee00000-0000-4000-8000-00000000c0ac","role":"authenticated"}';

-- ⚠️ THE FUNCTION ITSELF. The single fact everything else follows from.
select
  private.can_edit_team((select team_id from _t)) as can_edit_should_be_false,
  private.can_see_team((select team_id from _t)) as can_see_should_be_false;

-- ⚠️ AND THE POLICIES, because a correct function wired into a policy that
-- reads a different column is still a hole. These count what the DATABASE
-- would hand this person, not what a screen would draw.
--
-- ⚠️ EVENTS ARE EXPECTED TO BE VISIBLE, AND THAT IS NOT A BUG. `event read`
-- is gated on `private.is_attached_to_team`, which is deliberately status-
-- blind — 20260808_membership_pending_status.sql: "ANY status. Gates
-- non-sensitive squad context: fixtures and training times", and "Fixtures
-- are not sensitive, and a pending parent needs them to be worth signing in
-- at all." An earlier draft of this harness asserted events = 0, which would
-- have taught a future session to "fix" a working design. **The sensitive
-- rows are players and contacts, and those are what must be zero.**
select
  (select count(*) from players  where team_id = (select team_id from _t)) as players_visible_expect_0,
  (select count(*) from player_contacts) as contacts_visible_expect_0,
  (select count(*) from events   where team_id = (select team_id from _t)) as events_visible_expect_MANY;

-- A write must be refused outright rather than silently affecting zero rows:
-- both are "0 rows" to PostgREST, and only one of them is access control.
do $$
declare
  _team uuid;
begin
  select team_id into _team from _t;
  begin
    insert into events (club_id, team_id, type, title, starts_at)
    values ((select club_id from _t), _team, 'training', 'HARNESS should not exist', now());
    raise exception 'FAIL: a pending coach inserted an event';
  exception
    when insufficient_privilege then
      raise notice 'PASS: insert refused by RLS';
    when others then
      -- A "new row violates row-level security policy" arrives as 42501 too,
      -- but be explicit rather than swallowing an unrelated error as a pass.
      if sqlstate = '42501' then
        raise notice 'PASS: insert refused by RLS (42501)';
      else
        raise;
      end if;
  end;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE FAULT INJECTION. A check that has never failed is not a check.
--  Flip the membership to active and the SAME assertions must go the other
--  way. If they do not, this harness is measuring nothing — most likely
--  because `set local role authenticated` did not take and everything above
--  ran as the owner with RLS bypassed.
-- ══════════════════════════════════════════════════════════════════════════
reset role;
update memberships set status = 'active'
where profile_id = 'cee00000-0000-4000-8000-00000000c0ac';

set local role authenticated;
set local request.jwt.claims = '{"sub":"cee00000-0000-4000-8000-00000000c0ac","role":"authenticated"}';

select
  private.can_edit_team((select team_id from _t)) as can_edit_should_now_be_TRUE,
  (select count(*) from players where team_id = (select team_id from _t)) as players_now_visible_expect_gt_0;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 10 Aug 2026, immediately after the migration
--    can_edit_should_be_false          f
--    can_see_should_be_false           f
--    players_visible_expect_0          0
--    contacts_visible_expect_0         0
--    events_visible_expect_MANY        34   <-- DELIBERATE, see the note above
--    NOTICE                            PASS: insert refused by RLS
--    can_edit_should_now_be_TRUE       t
--    players_now_visible_expect_gt_0   > 0
--
--  ⚠️ If the LAST TWO do not flip, stop. Everything above them is a false
--  green: the run was almost certainly executing as `postgres`, where RLS
--  does not apply and every count is whatever the table happens to hold.
-- ══════════════════════════════════════════════════════════════════════════
