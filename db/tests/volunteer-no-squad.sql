-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — a volunteer's access request needs no squad; everyone else's
--  still does. Both enforcement points: the signup-wizard trigger
--  (private.handle_new_user) and the INSERT policy (RollCall/RequestAccess).
--  Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction, rolled
--  back. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay's ruling, 26 Aug 2026, reversing his 17 Aug "keep the squad
-- requirement" one after a real committee member was walled out of the
-- signup wizard the same day. Migration: 20260826_volunteer_no_squad.sql;
-- decision: claude/decisions/2026-08-26-volunteer-no-squad.md.
--
-- WHAT THIS ASSERTS
--
--   1. wizard path: a helper-only signup (claimed_role 'volunteer', no
--      squads) CREATES an access request, team columns null      <- the fix
--   2. wizard path: a parent signup with no squads still creates
--      NO request                                                <- control
--   3. RLS path: 'volunteer' with a null team is ACCEPTED        <- the fix
--   4. RLS path: 'parent' with a null team is still REFUSED      <- control
--   5. RLS path: 'parent' WITH a team is still accepted          <- control
--
-- ⚠️ 2, 4 AND 5 ARE NOT PADDING. Without 4 and 5, a "fix" that dropped the
-- team requirement for every role — the thing the 16 Aug ruling exists to
-- prevent — passes 1 and 3 clean. Without 2, the trigger could mint
-- squadless requests for everyone and only the policy half would object.

begin;

-- ── Fixture: four invented people, one real squad ─────────────────────────
create temporary table _team on commit drop as
select id as team_id from public.teams order by sort_order limit 1;

do $$ begin
  if not exists (select 1 from _team) then
    raise exception 'FIXTURE: no teams in the database — control 5 would be free.';
  end if;
end $$;

-- The wizard path: inserting into auth.users fires private.handle_new_user.
-- b1 is the committee member; b2 the parent control. Both born confirmed.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
  ('fff00000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','harness.volunteer@example.invalid', now(),
   jsonb_build_object('signup_intent', jsonb_build_object(
     'v', 1, 'first_name', 'Harness', 'last_name', 'Committee',
     'answers', jsonb_build_object('child', false, 'self', false, 'staff', false, 'helper', true),
     'squad_ids', jsonb_build_array(),
     'staff_role', null, 'staff_team_id', null,
     'claimed_role', 'volunteer', 'players', jsonb_build_array())),
   now(), now()),
  ('fff00000-0000-4000-8000-0000000000b2','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','harness.parent@example.invalid', now(),
   jsonb_build_object('signup_intent', jsonb_build_object(
     'v', 1, 'first_name', 'Harness', 'last_name', 'Parent',
     'answers', jsonb_build_object('child', true, 'self', false, 'staff', false, 'helper', false),
     'squad_ids', jsonb_build_array(),
     'staff_role', null, 'staff_team_id', null,
     'claimed_role', 'parent', 'players', jsonb_build_array())),
   now(), now());

-- 1 · the committee member's request exists, squadless
do $$
declare _row public.access_requests;
begin
  select * into _row from public.access_requests
   where profile_id = 'fff00000-0000-4000-8000-0000000000b1';
  if _row.id is null then
    raise exception 'FAIL 1: helper-only signup created NO access request — the committee member is invisible to admins.';
  end if;
  if _row.requested_role <> 'volunteer' then
    raise exception 'FAIL 1: request role is % not volunteer.', _row.requested_role;
  end if;
  if _row.requested_team_id is not null or _row.requested_team_ids is not null then
    raise exception 'FAIL 1: a squadless signup grew a squad (% / %).',
      _row.requested_team_id, _row.requested_team_ids;
  end if;
end $$;

-- 2 · the squadless PARENT signup still creates no request
do $$ begin
  if exists (select 1 from public.access_requests
              where profile_id = 'fff00000-0000-4000-8000-0000000000b2') then
    raise exception 'FAIL 2: a parent signup with no squads minted a request — the relaxation has widened past volunteer.';
  end if;
end $$;

-- ── The RLS path: three more people, no signup_intent ─────────────────────
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
  ('fff00000-0000-4000-8000-0000000000b3','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','harness.rls.vol@example.invalid', now(),
   '{}'::jsonb, now(), now()),
  ('fff00000-0000-4000-8000-0000000000b4','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','harness.rls.par@example.invalid', now(),
   '{}'::jsonb, now(), now()),
  ('fff00000-0000-4000-8000-0000000000b5','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','harness.rls.ok@example.invalid', now(),
   '{}'::jsonb, now(), now());

create temporary table _r (seq int, detail text) on commit drop;
grant select, insert on _r to authenticated;
grant select on _team to authenticated;

-- 3 · volunteer, null team → accepted
select set_config('request.jwt.claims',
       '{"sub":"fff00000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.access_requests (profile_id, status, requested_role, requested_team_id)
  values ('fff00000-0000-4000-8000-0000000000b3', 'pending', 'volunteer', null);
  insert into _r values (3, 'allowed');
exception when others then
  insert into _r values (3, 'refused ('||sqlstate||')');
end $$;
reset role;

-- 4 · parent, null team → still refused
select set_config('request.jwt.claims',
       '{"sub":"fff00000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.access_requests (profile_id, status, requested_role, requested_team_id)
  values ('fff00000-0000-4000-8000-0000000000b4', 'pending', 'parent', null);
  insert into _r values (4, 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (4, 'refused ('||sqlstate||')');
end $$;
reset role;

-- 5 · parent, real team → still accepted
select set_config('request.jwt.claims',
       '{"sub":"fff00000-0000-4000-8000-0000000000b5","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.access_requests (profile_id, status, requested_role, requested_team_id)
  select 'fff00000-0000-4000-8000-0000000000b5', 'pending', 'parent', team_id from _team;
  insert into _r values (5, 'allowed');
exception when others then
  insert into _r values (5, 'refused ('||sqlstate||')');
end $$;
reset role;

-- ── Verdict ───────────────────────────────────────────────────────────────
do $$
declare _d text;
begin
  select detail into _d from _r where seq = 3;
  if _d <> 'allowed' then
    raise exception 'FAIL 3: a volunteer with no squad was % — the policy half of the fix is missing.', _d;
  end if;
  select detail into _d from _r where seq = 4;
  if _d not like 'refused (42501)%' then
    raise exception 'FAIL 4: a parent with no squad got "%" — the 16 Aug who-are-you rule has been relaxed past volunteer.', _d;
  end if;
  select detail into _d from _r where seq = 5;
  if _d <> 'allowed' then
    raise exception 'FAIL 5: a parent WITH a squad was % — the policy has been over-tightened.', _d;
  end if;
  raise notice 'SELF-TEST PASSED — 5 steps: the wizard and the policy both let a volunteer through squadless, and only a volunteer.';
end $$;

rollback;
