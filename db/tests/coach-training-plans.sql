-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — coaches build their own training plans: squad-owned drills, and
--  draft/staff/squad session visibility. Assumes 20260827_coach_training_plans
--  is applied. Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction,
--  rolled back. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay's ruling, 27 Aug 2026 (claude/decisions/2026-08-27-coach-training-plans.md):
-- a coach manages their OWN squad's drills/templates and may SUGGEST one to the
-- club library (only the Director approves); a coach-built session is draft
-- (author only) -> staff (squad staff) -> squad (families), the Director's
-- publish staying squad-visible.
--
-- WHAT THIS ASSERTS — every line has its opposite as a control:
--   1  coach inserts a drill for their own squad                 allowed
--   2  coach inserts a CLUB drill (team_id null)                 refused  <- boundary
--   3  outsider coach inserts a drill for a squad not theirs     refused
--   4  coach nulls team_id on their own drill (self-promote)     refused  <- boundary
--   5  admin approves the suggestion (team_id -> null)           allowed
--   6  a parent can READ a squad-owned drill                     allowed  (reads open)
--   7  parent reads a coach's DRAFT session                      0 rows   <- boundary
--   8  a co-coach reads the DRAFT                                0 rows   <- boundary
--   9  parent reads it once promoted to STAFF                    0 rows
--  10  a co-coach reads it once STAFF                            1 row
--  11  parent reads it once promoted to SQUAD                    1 row
--  12  a co-coach edits the SQUAD session                        allowed
--  13  a co-coach edits the author's DRAFT                       refused  <- boundary
--
-- ⚠️ THE CONTROLS ARE THE POINT. Without 6, a fix that hid squad drills from
-- everyone passes 1-5. Without 10/11/12, a fix that hid every session passes
-- 7/8/9. Both directions, every time.
--
-- ⚠️ THE SESSION POLICY QUALIFIES `training_sessions.created_by` — `events`
-- has its own `created_by`, and an unqualified reference bound to the event's
-- creator, making every draft insert refuse. Measured 27 Aug 2026; the check
-- for FIXTURE-draft-create below is what would catch a regression of it.

begin;

create temporary table _r (seq int, detail text) on commit drop;
grant select, insert on _r to authenticated;

-- ── Fixture (as owner): a throwaway club, two squads, five people, events ──
insert into public.clubs (id, name) values
  ('cccccccc-0000-4000-8000-000000000001', 'Harness Club');
insert into public.teams (id, club_id, name) values
  ('cccccccc-0000-4000-8000-000000000010', 'cccccccc-0000-4000-8000-000000000001', 'ZZ Harness U13'),
  ('cccccccc-0000-4000-8000-000000000011', 'cccccccc-0000-4000-8000-000000000001', 'ZZ Harness U15');
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cccccccc-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.coach@example.invalid', now(), now()),
  ('cccccccc-0000-4000-8000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.coach2@example.invalid', now(), now()),
  ('cccccccc-0000-4000-8000-000000000023','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.parent@example.invalid', now(), now()),
  ('cccccccc-0000-4000-8000-000000000024','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.admin@example.invalid', now(), now()),
  ('cccccccc-0000-4000-8000-000000000025','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.outsider@example.invalid', now(), now());
insert into public.profiles (id, full_name, email) values
  ('cccccccc-0000-4000-8000-000000000021','H Coach','h.coach@example.invalid'),
  ('cccccccc-0000-4000-8000-000000000022','H Coach Two','h.coach2@example.invalid'),
  ('cccccccc-0000-4000-8000-000000000023','H Parent','h.parent@example.invalid'),
  ('cccccccc-0000-4000-8000-000000000024','H Admin','h.admin@example.invalid'),
  ('cccccccc-0000-4000-8000-000000000025','H Outsider','h.outsider@example.invalid')
on conflict (id) do nothing;
-- A parent membership needs a linked player (memberships_family_role_needs_player).
insert into public.players (id, club_id, team_id, full_name) values
  ('cccccccc-0000-4000-8000-000000000061','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','H Child');
insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
  ('cccccccc-0000-4000-8000-000000000021','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','coach','active',null),
  ('cccccccc-0000-4000-8000-000000000022','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','coach','active',null),
  ('cccccccc-0000-4000-8000-000000000023','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','parent','active','cccccccc-0000-4000-8000-000000000061'),
  ('cccccccc-0000-4000-8000-000000000024','cccccccc-0000-4000-8000-000000000001',null,'admin','active',null),
  ('cccccccc-0000-4000-8000-000000000025','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000011','coach','active',null);
insert into public.events (id, club_id, team_id, type, starts_at) values
  ('cccccccc-0000-4000-8000-000000000031','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','training', now() + interval '1 day'),
  ('cccccccc-0000-4000-8000-000000000033','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','training', now() + interval '3 days');

-- ── coach: own drill (1), club drill (2), self-promote (4), two drafts ────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
do $$ begin insert into public.drills (id,club_id,team_id,title,category) values ('cccccccc-0000-4000-8000-000000000041','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','H squad drill','skill'); insert into _r values(1,'allowed'); exception when others then insert into _r values(1,'refused ('||sqlstate||')'); end $$;
do $$ begin insert into public.drills (id,club_id,team_id,title,category) values ('cccccccc-0000-4000-8000-000000000042','cccccccc-0000-4000-8000-000000000001',null,'H club drill','skill'); insert into _r values(2,'allowed'); exception when others then insert into _r values(2,'refused ('||sqlstate||')'); end $$;
do $$ declare n int; begin update public.drills set team_id=null where id='cccccccc-0000-4000-8000-000000000041'; get diagnostics n=row_count; insert into _r values(4, case when n=0 then 'refused (0 rows)' else 'allowed' end); exception when others then insert into _r values(4,'refused ('||sqlstate||')'); end $$;
do $$ begin insert into public.training_sessions (id,event_id,visibility,created_by,coach_edited_at) values ('cccccccc-0000-4000-8000-000000000051','cccccccc-0000-4000-8000-000000000031','draft','cccccccc-0000-4000-8000-000000000021',now()); insert into _r values(20,'created'); exception when others then insert into _r values(20,'CREATE FAILED ('||sqlstate||')'); end $$;
do $$ begin insert into public.training_sessions (id,event_id,visibility,created_by,coach_edited_at) values ('cccccccc-0000-4000-8000-000000000052','cccccccc-0000-4000-8000-000000000033','draft','cccccccc-0000-4000-8000-000000000021',now()); insert into _r values(21,'created'); exception when others then insert into _r values(21,'CREATE2 FAILED ('||sqlstate||')'); end $$;
reset role;

-- ── 3: outsider coach (other squad) inserts for U13 → refused ────────────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000025","role":"authenticated"}', true);
set local role authenticated;
do $$ begin insert into public.drills (id,club_id,team_id,title,category) values ('cccccccc-0000-4000-8000-000000000043','cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000010','H sneaky','skill'); insert into _r values(3,'allowed'); exception when others then insert into _r values(3,'refused ('||sqlstate||')'); end $$;
reset role;

-- ── 5: admin approves the suggestion (team_id -> null) → allowed ──────────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin update public.drills set team_id=null,submitted_at=null where id='cccccccc-0000-4000-8000-000000000041'; get diagnostics n=row_count; insert into _r values(5, case when n=1 then 'allowed' else 'refused (0 rows)' end); exception when others then insert into _r values(5,'refused ('||sqlstate||')'); end $$;
reset role;
update public.drills set team_id='cccccccc-0000-4000-8000-000000000010' where id='cccccccc-0000-4000-8000-000000000041';

-- ── 6 & 7: parent reads the drill (open), blind to the draft ─────────────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000023","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.drills where id='cccccccc-0000-4000-8000-000000000041'; insert into _r values(6, case when n=1 then 'allowed' else 'refused' end); end $$;
do $$ declare n int; begin select count(*) into n from public.training_sessions where id='cccccccc-0000-4000-8000-000000000051'; insert into _r values(7, case when n=0 then 'refused (0 rows)' else 'VISIBLE' end); end $$;
reset role;

-- ── 8: co-coach blind to the draft ───────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000022","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.training_sessions where id='cccccccc-0000-4000-8000-000000000051'; insert into _r values(8, case when n=0 then 'refused (0 rows)' else 'VISIBLE' end); end $$;
reset role;

-- ── promote to STAFF: parent still blind (9), co-coach sees it (10) ──────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
update public.training_sessions set visibility='staff' where id='cccccccc-0000-4000-8000-000000000051';
reset role;
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000023","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.training_sessions where id='cccccccc-0000-4000-8000-000000000051'; insert into _r values(9, case when n=0 then 'refused (0 rows)' else 'VISIBLE' end); end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000022","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.training_sessions where id='cccccccc-0000-4000-8000-000000000051'; insert into _r values(10, case when n=1 then 'allowed' else 'refused (0 rows)' end); end $$;
reset role;

-- ── promote to SQUAD: the parent sees it (11) ────────────────────────────
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
update public.training_sessions set visibility='squad' where id='cccccccc-0000-4000-8000-000000000051';
reset role;
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000023","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.training_sessions where id='cccccccc-0000-4000-8000-000000000051'; insert into _r values(11, case when n=1 then 'allowed' else 'refused (0 rows)' end); end $$;
reset role;

-- ── 12 & 13: co-coach edits the squad session (ok) and the draft (refused)
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000022","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin update public.training_sessions set notes='co' where id='cccccccc-0000-4000-8000-000000000051'; get diagnostics n=row_count; insert into _r values(12, case when n=1 then 'allowed' else 'refused (0 rows)' end); exception when others then insert into _r values(12,'refused ('||sqlstate||')'); end $$;
do $$ declare n int; begin update public.training_sessions set notes='sneak' where id='cccccccc-0000-4000-8000-000000000052'; get diagnostics n=row_count; insert into _r values(13, case when n=0 then 'refused (0 rows)' else 'ALLOWED' end); exception when others then insert into _r values(13,'refused ('||sqlstate||')'); end $$;
reset role;

-- ── Verdict ──────────────────────────────────────────────────────────────
do $$
declare d text;
begin
  select detail into d from _r where seq=20; if d<>'created' then raise exception 'FIXTURE draft create (the events.created_by qualification bug): %', d; end if;
  select detail into d from _r where seq=21; if d<>'created' then raise exception 'FIXTURE draft2 create: %', d; end if;
  select detail into d from _r where seq=1;  if d<>'allowed'          then raise exception 'FAIL 1 own-squad drill: %', d; end if;
  select detail into d from _r where seq=2;  if d not like 'refused%' then raise exception 'FAIL 2 club drill by coach: %', d; end if;
  select detail into d from _r where seq=3;  if d not like 'refused%' then raise exception 'FAIL 3 outsider drill: %', d; end if;
  select detail into d from _r where seq=4;  if d not like 'refused%' then raise exception 'FAIL 4 self-promote: %', d; end if;
  select detail into d from _r where seq=5;  if d<>'allowed'          then raise exception 'FAIL 5 admin approve: %', d; end if;
  select detail into d from _r where seq=6;  if d<>'allowed'          then raise exception 'FAIL 6 parent reads drill: %', d; end if;
  select detail into d from _r where seq=7;  if d not like 'refused%' then raise exception 'FAIL 7 parent reads draft: %', d; end if;
  select detail into d from _r where seq=8;  if d not like 'refused%' then raise exception 'FAIL 8 co-coach reads draft: %', d; end if;
  select detail into d from _r where seq=9;  if d not like 'refused%' then raise exception 'FAIL 9 parent reads staff: %', d; end if;
  select detail into d from _r where seq=10; if d<>'allowed'          then raise exception 'FAIL 10 co-coach reads staff: %', d; end if;
  select detail into d from _r where seq=11; if d<>'allowed'          then raise exception 'FAIL 11 parent reads squad: %', d; end if;
  select detail into d from _r where seq=12; if d<>'allowed'          then raise exception 'FAIL 12 co-coach edits squad: %', d; end if;
  select detail into d from _r where seq=13; if d not like 'refused%' then raise exception 'FAIL 13 co-coach edits draft: %', d; end if;
  raise notice 'SELF-TEST PASSED — 13 checks: squad-owned drills stay the squad''s and only an admin promotes them; draft/staff/squad visibility holds both directions.';
end $$;

rollback;
