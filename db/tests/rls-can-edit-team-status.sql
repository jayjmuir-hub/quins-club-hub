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

-- ⚠️ `profiles` HAS NO `club_id` COLUMN, AND THIS LINE NAMED ONE UNTIL 13 Aug
-- 2026. The harness aborted at this INSERT with
--
--     42703: column "club_id" of relation "profiles" does not exist
--
-- so every assertion below it — the whole point of the file — had never run
-- since the column was dropped. Measured live 13 Aug: profiles is
-- (id, full_name, created_at, email, first_name, last_name, name_confirmed_at,
-- phone). A membership carries the club, which is where it belongs: one person
-- can hold rows in more than one club, so a club on the profile was always the
-- wrong shape.
--
-- ⚠️ `npm run db:check` WOULD HAVE CAUGHT THIS THE FIRST TIME IT RAN — the
-- runner throws on a SQL error. It had never been run against this file.
insert into profiles (id, full_name, email)
values ('cee00000-0000-4000-8000-00000000c0ac', 'Pending Coach',
        'pending.coach@example.invalid')
on conflict (id) do nothing;

-- The squad this person is PENDING staff on.
--
-- ⚠️ CHOSEN BY WHICH SQUAD HAS DATA, NOT BY `sort_order` — AND THAT WAS THE
-- THIRD THING BROKEN IN THIS FILE (13 Aug 2026). It used to read
-- `order by sort_order limit 1`, which today picks **U6 Tag**: zero players,
-- zero events. So `players_visible_expect_0` and `contacts_visible_expect_0`
-- came back 0 for a reason that has nothing to do with RLS — they are 0 for
-- ANYBODY, including a full admin, because the squad is empty. The harness was
-- passing its own assertions while measuring nothing, and its fault-injection
-- arm (`players_now_visible_expect_gt_0`) could never flip.
--
-- ⚠️ IT WAS NOT ALWAYS VACUOUS, WHICH IS THE POINT. The footer records `events
-- 34` on 10 Aug 2026, so the first squad by sort_order had data then. The
-- fixture moved out from under a hard-coded choice — the seeded September and
-- the three senior squads both went — and nothing said so, because nobody ran
-- it. **A harness must pick its subject by the property it needs, never by an
-- ordering that happens to have it today.**
create temporary table _t on commit drop as
select t.id as team_id, t.club_id
from teams t
order by (select count(*) from players p where p.team_id = t.id) desc,
         (select count(*) from events e where e.team_id = t.id) desc,
         t.sort_order
limit 1;

-- ⚠️ THE GRANT IS NOT OPTIONAL, AND ITS ABSENCE WAS THE SECOND THING BROKEN IN
-- THIS FILE (found 13 Aug 2026, with the `profiles.club_id` fix above). A temp
-- table is owned by `postgres`; every SELECT below runs after
-- `set local role authenticated`, so without this the harness dies with
--
--     42501: permission denied for table _t
--
-- which reads exactly like the RLS refusal this file exists to test, and is
-- nothing of the sort. Two independent breakages in one harness, neither ever
-- hit, is what "a check nobody RUNS is not a check" costs in practice.
grant select on _t to authenticated;

-- What the chosen squad ACTUALLY holds, counted as the owner before any role
-- switch. The vacuity guard at the foot of this file compares against these:
-- "the pending coach sees 0 players" only means something if the squad has
-- players to withhold.
create temporary table _fixture on commit drop as
select (select name from teams where id = (select team_id from _t)) as squad,
       (select count(*) from players where team_id = (select team_id from _t)) as players,
       (select count(*) from events  where team_id = (select team_id from _t)) as events;
grant select on _fixture to authenticated;

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

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTIONS. Everything above prints; this is what FAILS.
--
--  Added 13 Aug 2026 along with two other repairs to this file — it had been
--  aborting on `profiles.club_id` (a column that no longer exists), dying on a
--  missing temp-table grant, and choosing an EMPTY squad as its subject. Three
--  independent breakages, none ever hit, because `npm run db:check` had never
--  been pointed at it and pasting it by hand had stopped happening.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _team uuid;
  _squad text;
  _fixture_players int;
  _fixture_events int;
  _players_now int;
begin
  select team_id into _team from _t;
  -- ⚠️ READ FROM `_fixture`, NOT FROM `teams`/`players` DIRECTLY. This block
  -- runs as `authenticated`, so a direct count here would be filtered by the
  -- very policies under test and the guard would compare a number against
  -- itself. `_fixture` was captured as the owner before the role switch.
  select squad, players, events into _squad, _fixture_players, _fixture_events
    from _fixture;

  -- ⚠️ THE VACUITY GUARD, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE.
  -- Every "expect 0" above is satisfied by an EMPTY SQUAD for reasons that have
  -- nothing to do with row-level security. If the club has no squad carrying
  -- both players and fixtures, this harness cannot distinguish a working policy
  -- from a broken one and must say so rather than pass.
  if _fixture_players = 0 or _fixture_events = 0 then
    raise exception 'FAIL (VACUOUS): the chosen squad "%" has % players and % events. Every "expect 0" in this harness is then trivially true and proves nothing about RLS. Seed a squad with both before trusting this file.',
      _squad, _fixture_players, _fixture_events;
  end if;

  -- ⚠️ THE FAULT INJECTION MUST HAVE TAKEN. can_edit_team was false while
  -- pending; it must be true now. If it is not, `set local role authenticated`
  -- never took and everything above ran as the owner with RLS bypassed — the
  -- easiest false green available here.
  if not private.can_edit_team(_team) then
    raise exception 'FAIL: after flipping the membership to active, can_edit_team is still false. The injection did not take, so every assertion above is meaningless.';
  end if;

  select count(*) into _players_now from players where team_id = _team;
  if _players_now = 0 then
    raise exception 'FAIL: an ACTIVE coach sees 0 players on squad "%", which holds %. The role switch or the policy is broken.',
      _squad, _fixture_players;
  end if;

  raise notice 'SELF-TEST PASSED — subject squad "%" (% players, % events); pending saw none, active sees %.',
    _squad, _fixture_players, _fixture_events, _players_now;
end $$;

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
