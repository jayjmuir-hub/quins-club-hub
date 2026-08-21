-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — training plans: the constraints and the publish that must hold
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Eight things, each proved against an injected fault rather than by running:
--   1. A drill in use cannot be DELETED (on delete restrict). Retire instead.
--   2. A second session on one event is refused (UNIQUE event_id).
--   3. publish_training with _preview = true counts and writes NOTHING.
--   4. A real publish writes every training in range and never a match.
--   5. A coach-edited session is SKIPPED and COUNTED, its content untouched.
--   6. A coach cannot call publish_training at all.
--   7. A contact template published to a TAG squad is refused 42501.
--   8. A team id that is not in this club is refused 42501.
--
-- ⚠️ 7 AND 8 TEST db/migrations/20260821_publish_training_fit_check.sql, WHICH
-- IS WRITTEN AND NOT APPLIED. Until Jay applies it they will report FAIL, and
-- that FAIL is correct — see the EXPECTED footer.
--
-- ⚠️ 5 IS THE ONE THAT MATTERS. "Publish never overwrites a coach's edit" is
-- the rule that lets multi-squad publish be safe at all; this is the line
-- that stops it being "simplified" away.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. Steps 3-6 run as authenticated.
-- ⚠️ The admin uuid is a PROFILE id, the same one the other harnesses use.
-- Every person and squad below is INVENTED — rule 9.

begin;
create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- One invented coach on the first squad; the admin is the production admin
-- profile the other harnesses use (a PROFILE id, not a membership id).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-00000000d001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach-tp@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values ('c0000000-0000-4000-8000-00000000d001','Coach TP','coach-tp@example.invalid') on conflict (id) do nothing;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000d001', club_id, id, 'coach','active' from teams order by sort_order limit 1;

-- Two training events and one MATCH in the window, for the first squad.
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d1', club_id, id, 'training','HARNESS train 1', now() + interval '2 days' from teams order by sort_order limit 1;
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d2', club_id, id, 'training','HARNESS train 2', now() + interval '5 days' from teams order by sort_order limit 1;
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d3', club_id, id, 'match','HARNESS match', now() + interval '3 days' from teams order by sort_order limit 1;

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

-- 3. Preview writes nothing. Run as the admin.
set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare w int; n int; begin
  select will_write into w from publish_training('a0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, true);
  select count(*) into n from training_sessions where event_id in ('eee00000-0000-4000-8000-0000000000d1','eee00000-0000-4000-8000-0000000000d2');
  insert into _r values ('preview counts 2 and writes 0', case when w = 2 and n = 0 then 'PASS' else 'FAIL w='||w||' n='||n end);
end $$;

-- 4. Real publish writes 2 sessions, 2 blocks, and not the match.
do $$ declare n int; m int; begin
  perform publish_training('a0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, false);
  select count(*) into n from training_sessions where event_id in ('eee00000-0000-4000-8000-0000000000d1','eee00000-0000-4000-8000-0000000000d2');
  select count(*) into m from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000d3';
  insert into _r values ('publish writes both trainings, not the match', case when n = 2 and m = 0 then 'PASS' else 'FAIL n='||n||' m='||m end);
end $$;

-- 5. A coach-edited session is skipped and COUNTED. Inject the edit as the coach.
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000d001","role":"authenticated"}';
update training_sessions set coach_edited_at = now(), notes = 'coach changed it'
 where event_id = 'eee00000-0000-4000-8000-0000000000d1';

reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare s int; w int; kept text; begin
  select skipped_coach_edited, will_write into s, w from publish_training('a0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, false);
  select notes into kept from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000d1';
  insert into _r values ('publish skips the coach edit and reports it',
    case when s = 1 and w = 1 and kept = 'coach changed it' then 'PASS' else 'FAIL s='||s||' w='||w||' kept='||coalesce(kept,'null') end);
end $$;

-- 6. A coach cannot call publish at all.
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000d001","role":"authenticated"}';
do $$ begin
  perform publish_training('a0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, true);
  insert into _r values ('coach calls publish','FAIL — allowed');
exception when insufficient_privilege then insert into _r values ('coach calls publish','PASS — refused 42501'); end $$;

reset role;

-- ── 7 and 8: the fit check inside publish_training ────────────────────────
-- ⚠️ SET UP AS `postgres` ON PURPOSE. The squad's contact flag is forced to
-- false here so the step does not depend on how production happens to have it
-- set today, and the whole transaction rolls back.
reset role;
update teams set requires_contact = false where id = (select id from teams order by sort_order limit 1);
insert into session_templates (id, club_id, name, total_minutes, requires_contact)
select 'a0000000-0000-4000-8000-0000000000a2', club_id, 'HARNESS contact hour', 15, true from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes)
values ('a0000000-0000-4000-8000-0000000000a2', 1, 'd0000000-0000-4000-8000-0000000000a1', 15);

-- 7. A contact template cannot reach a tag squad, even by direct RPC.
set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ begin
  perform publish_training('a0000000-0000-4000-8000-0000000000a2',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, true);
  insert into _r values ('contact template to a tag squad','FAIL — allowed');
exception when insufficient_privilege then insert into _r values ('contact template to a tag squad','PASS — refused 42501'); end $$;

-- 8. A team id that is not in this club at all. SECURITY DEFINER bypasses RLS,
-- so nothing else in the function would have noticed.
do $$ begin
  perform publish_training('a0000000-0000-4000-8000-0000000000a1',
    array['00000000-0000-4000-8000-000000000000'::uuid], current_date, current_date + 10, true);
  insert into _r values ('a team id not in this club','FAIL — allowed');
exception when insufficient_privilege then insert into _r values ('a team id not in this club','PASS — refused 42501'); end $$;

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
--  ⚠️ THE LAST TWO ARE NOT MEASURED, AND MUST NOT BE WRITTEN AS IF THEY WERE.
--  They test db/migrations/20260821_publish_training_fit_check.sql, which is
--  WRITTEN AND UNAPPLIED — Jay decides when it goes in. Against the function
--  as it stands in the database today they will read FAIL — allowed, which is
--  the correct answer to "has the migration been applied yet".
--    contact template to a tag squad               NOT YET MEASURED
--    a team id not in this club                    NOT YET MEASURED
-- ══════════════════════════════════════════════════════════════════════════
