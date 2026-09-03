-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — training plans: the constraints and the publish that must hold
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Three things, each proved against an injected fault rather than by running:
--   1. A drill in use cannot be DELETED (on delete restrict). Retire instead.
--   2. A second session on one event is refused (UNIQUE event_id).
--   3. publish_training is GONE and stays gone (20260903_drop_publish_training.sql),
--      with suggest_training present as the control.
--
-- ⚠️ UNTIL 3 Sep 2026 THIS FILE HAD EIGHT STEPS, six of them on
-- publish_training (preview writes nothing; a real publish writes every
-- training in range and never a match; a coach-edited session is skipped and
-- counted; a coach cannot call it; a contact template cannot reach a tag
-- squad; a foreign team id is refused). The director's publish became a
-- SUGGESTION on 2 Sep 2026 and those six properties are asserted for
-- suggest_training in db/tests/training-suggestions.sql. They were not
-- deleted from the club's guarantees — they moved.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. Every person and squad below is
-- INVENTED — rule 9.

begin;
create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- One invented coach on an invented squad; the admin is the production admin
-- profile the other harnesses use (a PROFILE id, not a membership id).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-00000000d001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach-tp@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values ('c0000000-0000-4000-8000-00000000d001','Coach TP','coach-tp@example.invalid') on conflict (id) do nothing;
-- ⚠️ A SYNTHETIC SQUAD, NOT THE CLUB'S FIRST — repointed 31 Aug 2026. Every
-- publish below ran against `teams order by sort_order limit 1`, a REAL squad,
-- and expected will_write to equal the two fixture trainings. The moment the
-- season's real trainings landed inside the 10-day window, w read 5 and the
-- harness went red about the CALENDAR filling up — the fixture-not-the-feature
-- rot claude/runbooks/db-harnesses.md documents. Same club (the production
-- admin's is_admin check needs that), zero real events, rolled back with
-- everything else.
insert into teams (id, club_id, name, sort_order, requires_contact)
select 'c0000000-0000-4000-8000-00000000d0f1', club_id, 'ZZ Harness TP Squad', 996, false
  from teams order by sort_order limit 1;

insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000d001', club_id, id, 'coach','active'
  from teams where id = 'c0000000-0000-4000-8000-00000000d0f1';

-- Two training events and one MATCH in the window, for the synthetic squad —
-- the only events it has, so the publish counts below are exact by construction.
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d1', club_id, id, 'training','HARNESS train 1', now() + interval '2 days' from teams where id = 'c0000000-0000-4000-8000-00000000d0f1';
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d2', club_id, id, 'training','HARNESS train 2', now() + interval '5 days' from teams where id = 'c0000000-0000-4000-8000-00000000d0f1';
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d3', club_id, id, 'match','HARNESS match', now() + interval '3 days' from teams where id = 'c0000000-0000-4000-8000-00000000d0f1';

-- A drill, and a template using it.
insert into drills (id, club_id, title, category, minutes)
select 'd0000000-0000-4000-8000-0000000000a1', club_id, 'HARNESS passing lines', 'skill', 15 from teams limit 1;
insert into session_templates (id, club_id, name, total_minutes)
select 'a0000000-0000-4000-8000-0000000000a1', club_id, 'HARNESS hour', 15 from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes)
values ('a0000000-0000-4000-8000-0000000000a1', 1, 'd0000000-0000-4000-8000-0000000000a1', 15);

-- 1. The restrict FK. A drill in use cannot be deleted.
do $$ begin
  delete from drills where id = 'd0000000-0000-4000-8000-0000000000a1';
  insert into _r values ('delete a drill in use','FAIL — allowed');
exception when foreign_key_violation then insert into _r values ('delete a drill in use','PASS — refused 23503'); end $$;

-- 2. UNIQUE on event_id.
insert into training_sessions (event_id) values ('eee00000-0000-4000-8000-0000000000d1');
do $$ begin
  insert into training_sessions (event_id) values ('eee00000-0000-4000-8000-0000000000d1');
  insert into _r values ('second session on one event','FAIL — allowed');
exception when unique_violation then insert into _r values ('second session on one event','PASS — refused 23505'); end $$;
delete from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000d1';

-- ── 3. publish_training IS GONE — a rot anchor, not a behaviour test ────────
-- Steps 3–8 of this harness used to exercise publish_training: preview writes
-- nothing, a real publish writes every training in range, a coach-edited
-- session is skipped and counted, a coach cannot call it, a contact template
-- cannot reach a tag squad, a foreign team id is refused. On 2 Sep 2026 the
-- director's publish became a SUGGESTION (20260902_training_suggestions.sql)
-- and every one of those properties is asserted, for suggest_training, in
-- db/tests/training-suggestions.sql. 20260903_drop_publish_training.sql then
-- removed the old function. This step pins that it STAYS removed — a function
-- that writes a coach's plan over their head must not quietly come back — and
-- the control beside it proves the catalogue query can see a function that
-- does exist.
do $$ declare gone int; control int; begin
  select count(*) into gone from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'publish_training';
  select count(*) into control from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'suggest_training';
  insert into _r values ('3 publish_training is gone (control: suggest_training exists)',
    case when gone = 0 and control = 1 then 'PASS' else 'FAIL gone='||gone||' control='||control end);
end $$;

reset role;

select * from _r;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; THIS is the
--  thing that fails.
--
--  Added 13 Aug 2026. `npm run db:check` throws on a SQL ERROR and on nothing
--  else, and it discarded every result set — so this harness reported `ok`
--  whatever the PASS/FAIL column said. The verdict was computed, written down,
--  and never compared to anything. NINE of the fifteen harnesses were in that
--  state, hours after the runner was written to fix "a check nobody RUNS is not
--  a check". A check that runs and cannot fail is not a check either.
--
--  The empty-table arm matters as much as the FAIL arm: a harness that recorded
--  no steps at all has proved nothing, and would otherwise pass silently.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _bad text;
  _n int;
begin
  select count(*) into _n from _r;
  if _n = 0 then
    raise exception 'FAIL: this harness recorded NO steps — nothing it claims to test was actually exercised.';
  end if;

  select string_agg(step || ' -> ' || outcome, ' | ') into _bad
    from _r where outcome like '%FAIL%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  raise notice 'SELF-TEST PASSED — % step(s), none reported FAIL.', _n;
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 21 Aug 2026, through the Supabase MCP (the
--  whole transaction rolled back; the six tables were empty before and after).
--    delete a drill in use                         PASS — refused 23503
--    second session on one event                   PASS — refused 23505
--    preview counts 2 and writes 0                 PASS
--    publish writes both trainings, not the match  PASS
--    publish skips the coach edit and reports it   PASS
--    coach calls publish                           PASS — refused 42501
--
--    contact template to a tag squad               PASS — refused 42501
--    a team id not in this club                    PASS — refused 42501
--
--  7 and 8 measured 21 Aug 2026 immediately after publish_training_fit_check
--  was applied; before it, both read FAIL — allowed, which was the correct
--  answer to "has the migration been applied yet".
-- ══════════════════════════════════════════════════════════════════════════
