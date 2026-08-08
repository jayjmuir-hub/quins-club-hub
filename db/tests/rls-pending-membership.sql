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

insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '00000000-1111-2222-3333-444444444444', t.club_id, t.id, 'parent',
       (select id from public.players where full_name = 'Test Player One'), 'pending'
from public.teams t where t.name = 'U16';

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
insert into public.availability (event_id, player_id, status)
select (select id from public.events order by starts_at limit 1),
       (select id from public.players where full_name = 'Test Player One'),
       'in';   -- allowed values are in / out / maybe

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
