-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — the pending membership state
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK. No test user, player, or
--  membership survives it, and it can be re-run as often as you like.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
-- Row Level Security means the DATABASE filters rows per user — closest to an
-- ACL evaluated on every query. So a screen that hides a row is not security:
-- if the database would return it, anyone with the REST endpoint or a copied
-- token gets it. This harness therefore asks the database directly and never
-- goes near the UI.
--
-- ⚠️ AS `postgres` (the owner) RLS IS BYPASSED ENTIRELY. A test that forgets
-- `set local role authenticated` passes while proving nothing whatsoever.
-- That is the single easiest way to get a false green here.
--
-- WHAT IT GUARDS, measured live on 8 Aug 2026 BEFORE the fix:
--     players_visible   6   <-- a brand-new parent saw THE WHOLE SQUAD
--     contacts_visible  1
--     events_visible   26
-- `player read` was `can_see_team(team_id)`, and can_see_team was true for any
-- membership row with a matching team_id whatever its role. One row pointing
-- at U16 and Postgres handed over every U16 child's name, photo and gender.
--
-- ⚠️ `player_contacts` was ALREADY SAFE (1, not 6) — its `contact edit own`
-- policy is is_own_player, so parent phone numbers never leaked. And there is
-- NO date-of-birth column in `players` at all. Both were overstated in the
-- session that wrote this; overstating a risk is how people stop believing
-- the warnings.
--
-- REQUIRES: at least 6 players on U16. If the fixture ever shrinks to one,
-- "returned 1 row" stops distinguishing "correctly filtered" from "there was
-- only one", and this harness quietly stops meaning anything.

begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('00000000-1111-2222-3333-444444444444',
        '00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','rls-probe@example.invalid', now(),
        '{"full_name":"RLS Probe"}'::jsonb, now(), now());

-- ⚠️ A PLAYER FROM THE SQUAD, NOT ONE BY NAME. This read
-- `where full_name = 'Test Player One'` — a row that no longer exists, so the
-- subquery returned NULL and the insert died on
-- `memberships_family_role_needs_player`. Naming a specific person makes the
-- fixture depend on the club's live roster, which is exactly what the comment
-- below warns about for the SQUAD and was never applied to the PLAYER.
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '00000000-1111-2222-3333-444444444444', t.club_id, t.id, 'parent',
       (select p.id from public.players p
         where p.team_id = t.id order by p.full_name limit 1), 'pending'
-- ⚠️ RENAMED 9 Aug 2026: this squad was 'U16' until the club's real name list
-- landed. It KEPT ITS ID through the rename, so the 6 players / 26 events
-- fixture is literally the same rows. If this select matches nothing the
-- membership insert quietly inserts zero rows and every count below reads 0 —
-- which looks like a correctly locked-down parent rather than a dead harness.
from public.teams t where t.name = 'U16B'
  and exists (select 1 from public.players p where p.team_id = t.id);

do $$
begin
  -- ⚠️ LOUD, BECAUSE THE SILENT VERSION LOOKS LIKE A PASS. If the squad or
  -- its players vanish, the insert above adds zero rows and every count below
  -- reads 0 — indistinguishable from a correctly locked-down pending member,
  -- which is the very thing this harness exists to prove.
  if not exists (select 1 from public.memberships
                  where profile_id = '00000000-1111-2222-3333-444444444444') then
    raise exception
      'PENDING MEMBERSHIP: the fixture membership was not created — squad '
      '"U16B" is missing or has no players. Every zero below would be free.';
  end if;
end $$;

select set_config('request.jwt.claims',
       '{"sub":"00000000-1111-2222-3333-444444444444","role":"authenticated"}', true);
set local role authenticated;

create temp table results (state text, players int, contacts int, events int, avail int);

insert into results select 'PENDING',
       (select count(*) from public.players),
       (select count(*) from public.player_contacts),
       (select count(*) from public.events),
       (select count(*) from public.availability);

-- ⚠️ THE SILENT ONE. `avail own insert` and `avail own update` are both
-- is_own_player, but `avail read` was can_see_team — so before the fix a
-- pending parent SAVED their availability and then could not see it. The write
-- succeeded, the row vanished, nothing errored, and it read as "the app lost
-- my answer". Found by reading the policies side by side, not by testing.
-- ⚠️ THE SAME CHILD THE MEMBERSHIP NAMES, AND AN EVENT ON THAT SQUAD.
-- This read `where full_name = 'Test Player One'` — a row that no longer
-- exists — and took the club's earliest event regardless of squad. The null
-- player made `avail own insert` (is_own_player) refuse, so the harness died
-- here reporting "new row violates row-level security policy", which reads as
-- the policy being wrong and was the fixture being empty.
insert into public.availability (event_id, player_id, status)
select e.id, m.player_id, 'in'   -- allowed values are in / out / maybe
  from public.memberships m
  join public.events e on e.team_id = m.team_id
 where m.profile_id = '00000000-1111-2222-3333-444444444444'
 order by e.starts_at
 limit 1;

insert into results select 'PENDING + saved availability',
       (select count(*) from public.players),
       (select count(*) from public.player_contacts),
       (select count(*) from public.events),
       (select count(*) from public.availability);

reset role;
update public.memberships set status = 'active'
 where profile_id = '00000000-1111-2222-3333-444444444444';
set local role authenticated;

insert into results select 'ACTIVE',
       (select count(*) from public.players),
       (select count(*) from public.player_contacts),
       (select count(*) from public.events),
       (select count(*) from public.availability);

select state, players, contacts, events, avail,
       case state
         when 'PENDING'                      then (players = 1 and events = 26)
         when 'PENDING + saved availability' then (avail = 1)
         when 'ACTIVE'                       then (players = 6)
       end as pass
from results;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above computes a `pass` column and NOTHING
--  EVER READ IT.
--
--  Added 13 Aug 2026. `npm run db:check` throws on a SQL ERROR and on nothing
--  else, and discarded every result set — so this file reported `ok` with
--  `pass` sitting at false. The verdict was computed, printed, and compared to
--  nothing. Nine of the fifteen harnesses were in that state.
--
--  ⚠️ THE ASSERTED CONDITIONS ARE NOT THE ONES IN THE `pass` COLUMN ABOVE, AND
--  THE DIFFERENCE IS DELIBERATE — this file's own footer says why:
--
--    `events = 26` IS NOT ASSERTED. The footer: "events is 26 because that is
--    the fixture at the time of writing. It is a COUNT and counts rot — every
--    count in this project's history has." Pinning it would turn the nightly
--    job red the next time anybody adds a fixture, which is the fastest way to
--    teach everyone to ignore a red run. What matters is that a PENDING parent
--    sees SOME events (fixtures are deliberately not sensitive) and exactly one
--    PLAYER (their own child).
--
--    `players = 6` BECOMES `players > 1` for the same reason. Six is today's
--    squad size. The invariant is that approving the membership makes the rest
--    of the squad appear — i.e. more than the single own-child row visible
--    while pending. That is what the test is about, and it survives a new
--    player joining.
--
--  ⚠️ `players = 1` WHILE PENDING IS THE ONE THAT MUST STAY EXACT. It is the
--  security claim: a pending parent sees their own child and no other child.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _pending_players int;
  _pending_events int;
  _avail int;
  _active_players int;
begin
  select players, events into _pending_players, _pending_events
    from results where state = 'PENDING';
  select avail into _avail
    from results where state = 'PENDING + saved availability';
  select players into _active_players
    from results where state = 'ACTIVE';

  if _pending_players is null or _active_players is null then
    raise exception 'FAIL: the harness did not record all three states — nothing it claims to test was exercised.';
  end if;

  if _pending_players <> 1 then
    raise exception 'FAIL: a PENDING parent saw % players, expected exactly 1 (their own child). Anything higher means every child on the squad is visible to somebody nobody has approved.', _pending_players;
  end if;

  if _pending_events = 0 then
    raise exception 'FAIL: a PENDING parent saw 0 events. Fixtures are deliberately visible while pending — 20260808_membership_pending_status.sql: "a pending parent needs them to be worth signing in at all". Zero means `event read` has been narrowed to can_see_team.';
  end if;

  if _avail is distinct from 1 then
    raise exception 'FAIL: the availability a PENDING parent saved read back as %, expected 1.', _avail;
  end if;

  -- ⚠️ THE NON-VACUITY ARM. If approving the membership changed nothing, every
  -- assertion above is equally explained by "this person can see nothing at
  -- all", which is what a lost `set local role authenticated` produces.
  if _active_players <= 1 then
    raise exception 'FAIL: after approval the parent saw % players, expected more than the 1 visible while pending. The pending assertions above are therefore meaningless — most likely the run is executing as postgres with RLS bypassed, or the status update did not take.', _active_players;
  end if;

  raise notice 'SELF-TEST PASSED — pending sees 1 player and % events; active sees % players.', _pending_events, _active_players;
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED
--    PENDING                       players 1   events 26   -> own child only
--    PENDING + saved availability  avail   1               -> write reads back
--    ACTIVE                        players 6               -> squad appears
--
--  ⚠️ events is 26 because that is the fixture at the time of writing. It is
--  a COUNT and counts rot — every count in this project's history has. If it
--  differs, re-read it rather than assuming a failure.
-- ══════════════════════════════════════════════════════════════════════════
--
--  FAULT INJECTION — run this too. A green test that cannot go red is
--  decoration. DDL is transactional in Postgres, so the broken function lives
--  only inside the transaction and production is never exposed.
--
--    begin;
--    create or replace function private.can_see_team(_team uuid)
--     returns boolean language sql stable security definer set search_path to 'public'
--    as $f$
--      select exists (select 1 from memberships m
--        where m.profile_id = auth.uid()
--          and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
--               or m.team_id = _team));
--    $f$;
--    -- ...then the fixture + impersonation above...
--    -- EXPECTED: players = 6 while PENDING. If it still says 1, the harness
--    -- is not testing what it claims and nothing it reports can be trusted.
--    rollback;
--
--  Verified 8 Aug 2026: sabotaged -> 6, and the rollback restored the real
--  function (checked with pg_get_functiondef afterwards, because a fault left
--  behind by a "safe" experiment is the worst possible outcome here).
