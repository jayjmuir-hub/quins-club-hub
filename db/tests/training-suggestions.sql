-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — training suggestions: publish never writes a coach's plan
--  Paste into the Supabase SQL editor, or run `npm run db:check`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260902_training_suggestions.sql. Eleven things, each proved
-- against an injected fault rather than by running:
--   1. suggest_training with _preview = true counts and writes NOTHING.
--   2. A real suggest writes one pending row per training in range, never for
--      the match, and NOT ONE ROW in training_sessions — the rule the whole
--      feature exists for.
--   3. A coach's EXISTING plan is untouched by a suggest, and still gets its
--      suggestion row (publish_training would have skipped it).
--   4. The same template again is counted `unchanged`, writes nothing.
--   5. The squad's coach can read the suggestions; an unrelated signed-in
--      adult reads none — WITH the coach's count as the control.
--   6. Decline: status, decided_by, the trimmed note. The session is untouched.
--   7. Accept: the template's blocks are COPIED into the session,
--      coach_edited_at is stamped, visibility is 'staff', status accepted.
--   8. Accept over an existing plan REPLACES its blocks (the screen asks first)
--      and keeps its visibility.
--   9. A different template after accept is a fresh pending question; the
--      accepted session is NOT touched. The same template after decline stays
--      declined (never nags).
--  10. A coach cannot call suggest_training; an outsider cannot decide; an
--      answered suggestion cannot be answered twice.
--  11. A contact template cannot be SUGGESTED to a tag squad (42501) — the
--      publish_training rule, kept.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. The steps that matter run as
-- authenticated. The admin uuid is the production admin PROFILE id the other
-- harnesses use. Every person, squad, drill and hour below is INVENTED — rule 9.

begin;
create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- An invented coach, an invented outsider (a signed-in adult with no squad),
-- and a synthetic squad in the production admin's club with zero real events.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('c0000000-0000-4000-8000-00000000e001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach-ts@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000e002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider-ts@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values
  ('c0000000-0000-4000-8000-00000000e001','Coach TS','coach-ts@example.invalid'),
  ('c0000000-0000-4000-8000-00000000e002','Outsider TS','outsider-ts@example.invalid')
on conflict (id) do nothing;

insert into teams (id, club_id, name, sort_order, requires_contact)
select 'c0000000-0000-4000-8000-00000000e0f1', club_id, 'ZZ Harness TS Squad', 995, true
  from teams order by sort_order limit 1;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000e001', club_id, id, 'coach','active'
  from teams where id = 'c0000000-0000-4000-8000-00000000e0f1';

-- Two trainings and one match in the window — the squad's only events.
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000e1', club_id, id, 'training','HARNESS TS train 1', now() + interval '2 days' from teams where id = 'c0000000-0000-4000-8000-00000000e0f1';
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000e2', club_id, id, 'training','HARNESS TS train 2', now() + interval '5 days' from teams where id = 'c0000000-0000-4000-8000-00000000e0f1';
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000e3', club_id, id, 'match','HARNESS TS match', now() + interval '3 days' from teams where id = 'c0000000-0000-4000-8000-00000000e0f1';

-- Two drills; two hours (A uses both, B uses one) and a contact hour.
insert into drills (id, club_id, title, category, minutes)
select 'd0000000-0000-4000-8000-0000000000e1', club_id, 'HARNESS TS passing', 'skill', 15 from teams limit 1;
insert into drills (id, club_id, title, category, minutes)
select 'd0000000-0000-4000-8000-0000000000e2', club_id, 'HARNESS TS grid', 'skill', 20 from teams limit 1;
insert into session_templates (id, club_id, name, total_minutes)
select 'a0000000-0000-4000-8000-0000000000e1', club_id, 'HARNESS TS hour A', 35 from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes, coach_note) values
  ('a0000000-0000-4000-8000-0000000000e1', 1, 'd0000000-0000-4000-8000-0000000000e1', 15, 'hands up'),
  ('a0000000-0000-4000-8000-0000000000e1', 2, 'd0000000-0000-4000-8000-0000000000e2', 20, null);
insert into session_templates (id, club_id, name, total_minutes)
select 'a0000000-0000-4000-8000-0000000000e2', club_id, 'HARNESS TS hour B', 20 from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes) values
  ('a0000000-0000-4000-8000-0000000000e2', 1, 'd0000000-0000-4000-8000-0000000000e2', 20);
insert into session_templates (id, club_id, name, total_minutes, requires_contact)
select 'a0000000-0000-4000-8000-0000000000e3', club_id, 'HARNESS TS contact hour', 15, true from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes) values
  ('a0000000-0000-4000-8000-0000000000e3', 1, 'd0000000-0000-4000-8000-0000000000e1', 15);

-- The coach's own plan on train 2, saved before the director ever published.
insert into training_sessions (event_id, coach_edited_at, notes, visibility, created_by)
values ('eee00000-0000-4000-8000-0000000000e2', now() - interval '1 day', 'the coach''s own', 'squad', 'c0000000-0000-4000-8000-00000000e001');
insert into training_session_blocks (session_id, position, drill_id, minutes)
select id, 1, 'd0000000-0000-4000-8000-0000000000e1', 10 from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e2';

-- ── 1 and 2: preview, then the real thing. As the admin. ──────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare w int; n int; begin
  select will_suggest into w from suggest_training('a0000000-0000-4000-8000-0000000000e1',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, true);
  select count(*) into n from training_suggestions where event_id in ('eee00000-0000-4000-8000-0000000000e1','eee00000-0000-4000-8000-0000000000e2');
  insert into _r values ('1 preview counts 2 and writes 0', case when w = 2 and n = 0 then 'PASS' else 'FAIL w='||w||' n='||n end);
end $$;

do $$ declare w int; n int; m int; s int; begin
  select will_suggest into w from suggest_training('a0000000-0000-4000-8000-0000000000e1',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, false);
  select count(*) into n from training_suggestions where status = 'pending' and event_id in ('eee00000-0000-4000-8000-0000000000e1','eee00000-0000-4000-8000-0000000000e2');
  select count(*) into m from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e3';
  -- ⚠️ THE ONE THAT MATTERS: train 1 had no session and must STILL have none.
  select count(*) into s from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  insert into _r values ('2 suggest writes 2 pending rows, not the match, and NO session',
    case when w = 2 and n = 2 and m = 0 and s = 0 then 'PASS' else 'FAIL w='||w||' n='||n||' m='||m||' sessions='||s end);
end $$;

-- 3. The coach's existing plan on train 2: untouched, and suggested anyway.
do $$ declare kept text; b int; sg int; begin
  select notes into kept from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  select count(*) into b from training_session_blocks where session_id = (select id from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e2');
  select count(*) into sg from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e2' and status = 'pending';
  insert into _r values ('3 an existing coach plan is untouched and still gets a suggestion',
    case when kept = 'the coach''s own' and b = 1 and sg = 1 then 'PASS' else 'FAIL kept='||coalesce(kept,'null')||' blocks='||b||' suggested='||sg end);
end $$;

-- 4. Same template again: unchanged, nothing written.
do $$ declare w int; u int; t timestamptz; t2 timestamptz; begin
  select suggested_at into t from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  select will_suggest, unchanged into w, u from suggest_training('a0000000-0000-4000-8000-0000000000e1',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, false);
  select suggested_at into t2 from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  insert into _r values ('4 same template again is unchanged', case when w = 0 and u = 2 and t = t2 then 'PASS' else 'FAIL w='||w||' u='||u end);
end $$;

-- ── 5: who may read. Coach sees 2 (the control); outsider sees 0. ──────────
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000e001","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from training_suggestions where event_id::text like 'eee00000-0000-4000-8000-0000000000e%';
  insert into _r values ('5a the squad coach reads both suggestions (control)', case when n = 2 then 'PASS' else 'FAIL n='||n end);
end $$;
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000e002","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from training_suggestions where event_id::text like 'eee00000-0000-4000-8000-0000000000e%';
  insert into _r values ('5b an unrelated adult reads none', case when n = 0 then 'PASS' else 'FAIL n='||n end);
end $$;

-- ── 6: decline train 2 with a note (the coach). Session untouched. ─────────
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000e001","role":"authenticated"}';
do $$ declare st text; who uuid; note text; kept text; r uuid; begin
  select decide_training_suggestion(id, false, '  we did this last week  ') into r
    from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  select status, decided_by, decline_note into st, who, note from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  select notes into kept from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  insert into _r values ('6 decline: status, who, trimmed note, session untouched',
    case when st = 'declined' and who = 'c0000000-0000-4000-8000-00000000e001' and note = 'we did this last week' and kept = 'the coach''s own' and r is null
      then 'PASS' else 'FAIL st='||coalesce(st,'null')||' note='||coalesce(note,'null')||' kept='||coalesce(kept,'null') end);
end $$;

-- ── 7: accept train 1. Blocks copied, stamped, staff, accepted. ─────────────
do $$ declare sid uuid; r uuid; b int; ce timestamptz; vis text; st text; note1 text; begin
  select decide_training_suggestion(id, true, null) into r
    from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  select id, coach_edited_at, visibility into sid, ce, vis from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  select count(*) into b from training_session_blocks where session_id = sid;
  select coach_note into note1 from training_session_blocks where session_id = sid and position = 1;
  select status into st from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  insert into _r values ('7 accept copies 2 blocks with notes, stamps coach_edited_at, staff, accepted',
    case when r = sid and b = 2 and note1 = 'hands up' and ce is not null and vis = 'staff' and st = 'accepted'
      then 'PASS' else 'FAIL blocks='||coalesce(b::text,'null')||' vis='||coalesce(vis,'null')||' st='||coalesce(st,'null') end);
end $$;

-- ── 8: accept over an existing plan replaces its blocks, keeps visibility. ──
-- Reset train 2's suggestion to pending as postgres (it was declined in 6).
reset role;
update training_suggestions set status = 'pending', decided_by = null, decided_at = null, decline_note = null
 where event_id = 'eee00000-0000-4000-8000-0000000000e2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000e001","role":"authenticated"}';
do $$ declare sid uuid; b int; mins int; vis text; tpl uuid; begin
  perform decide_training_suggestion(id, true, null) from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  select id, visibility, template_id into sid, vis, tpl from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  select count(*), sum(minutes) into b, mins from training_session_blocks where session_id = sid;
  insert into _r values ('8 accept over an existing plan replaces its blocks and keeps visibility',
    case when b = 2 and mins = 35 and vis = 'squad' and tpl = 'a0000000-0000-4000-8000-0000000000e1'
      then 'PASS' else 'FAIL blocks='||b||' mins='||coalesce(mins::text,'null')||' vis='||coalesce(vis,'null') end);
end $$;

-- ── 9: a different template after accept → fresh pending, session untouched.
--       Then set train 2 declined and suggest hour B again → still declined.
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare w int; st text; who uuid; b int; begin
  select will_suggest into w from suggest_training('a0000000-0000-4000-8000-0000000000e2',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, false);
  select status, decided_by into st, who from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  select count(*) into b from training_session_blocks where session_id = (select id from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000e1');
  insert into _r values ('9a a different template after accept asks again and leaves the session alone',
    case when w = 2 and st = 'pending' and who is null and b = 2 then 'PASS' else 'FAIL w='||w||' st='||coalesce(st,'null')||' blocks='||b end);
end $$;
reset role;
update training_suggestions set status = 'declined', decided_by = 'c0000000-0000-4000-8000-00000000e001', decided_at = now()
 where event_id = 'eee00000-0000-4000-8000-0000000000e2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare u int; st text; begin
  select unchanged into u from suggest_training('a0000000-0000-4000-8000-0000000000e2',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, false);
  select status into st from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  insert into _r values ('9b the same template after decline never nags', case when u = 2 and st = 'declined' then 'PASS' else 'FAIL u='||u||' st='||coalesce(st,'null') end);
end $$;

-- ── 10: the refusals. ───────────────────────────────────────────────────────
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000e001","role":"authenticated"}';
do $$ begin
  perform suggest_training('a0000000-0000-4000-8000-0000000000e1',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, true);
  insert into _r values ('10a coach calls suggest_training','FAIL — allowed');
exception when insufficient_privilege then insert into _r values ('10a coach calls suggest_training','PASS — refused 42501'); end $$;
do $$ begin
  perform decide_training_suggestion(id, true, null) from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e2';
  insert into _r values ('10c an answered suggestion answered again','FAIL — allowed');
exception when invalid_parameter_value then insert into _r values ('10c an answered suggestion answered again','PASS — refused 22023'); end $$;
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000e002","role":"authenticated"}';
do $$ declare sid uuid; begin
  -- The outsider cannot even SELECT the row, so the id is fetched here as a
  -- literal lookup the policy cannot hide: decide must refuse on its own check.
  select id into sid from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  if sid is null then
    -- RLS hid it (expected). Prove the function refuses anyway with a known id
    -- fetched as postgres below.
    insert into _r values ('10b outsider cannot see the row (RLS)', 'PASS');
  else
    insert into _r values ('10b outsider cannot see the row (RLS)', 'FAIL — visible');
  end if;
end $$;
reset role;
do $$ declare sid uuid; begin
  select id into sid from training_suggestions where event_id = 'eee00000-0000-4000-8000-0000000000e1';
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000e002","role":"authenticated"}''';
  begin
    perform decide_training_suggestion(sid, true, null);
    insert into _r values ('10d outsider decides by id','FAIL — allowed');
  exception when insufficient_privilege then insert into _r values ('10d outsider decides by id','PASS — refused 42501');
  end;
  execute 'reset role';
end $$;

-- ── 11: contact hour to a tag squad is refused, even by direct RPC. ─────────
reset role;
update teams set requires_contact = false where id = 'c0000000-0000-4000-8000-00000000e0f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ begin
  perform suggest_training('a0000000-0000-4000-8000-0000000000e3',
    array['c0000000-0000-4000-8000-00000000e0f1'::uuid], current_date, current_date + 10, true);
  insert into _r values ('11 contact hour suggested to a tag squad','FAIL — allowed');
exception when insufficient_privilege then insert into _r values ('11 contact hour suggested to a tag squad','PASS — refused 42501'); end $$;

reset role;

select * from _r;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; THIS is the
--  thing that fails. A harness that recorded no steps has proved nothing.
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
