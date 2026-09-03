-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — training suggestion push: who is told, who must never be, and
--  that a publish sends ONE push per squad and a preview sends none.
--  Paste into the Supabase SQL editor, or run `npm run db:check`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
--  `net.http_post` is transactional (db/tests/fixture-push.sql explains), so
--  the queued request is counted and then un-sent by the rollback.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260902_training_suggestion_push.sql. Each expect-0 is paired
-- with an expect-1 on the same mechanism, and every "nobody" has a "somebody"
-- control beside it.
--   1. Audience: the squad's coach IS in it (control); the director who
--      pressed the button is NOT; a parent on the squad is NOT; a coach of a
--      DIFFERENT squad is NOT; a coach who switched `training` off is NOT.
--   2. A real suggest queues exactly one http request for the squad and one
--      outbox row of category 'training' with the squad's path.
--   3. A preview queues nothing.
--   4. Suggesting the same template again (nothing new) queues nothing.
--   5. `training` is an accepted opt-out category (the constraint took it).
--
-- Every person and squad below is INVENTED — rule 9. The admin uuid is the
-- production admin PROFILE id the other harnesses use.

begin;
create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('c0000000-0000-4000-8000-00000000f001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach-tsp@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000f002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','parent-tsp@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000f003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other-coach-tsp@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000f004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','quiet-coach-tsp@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values
  ('c0000000-0000-4000-8000-00000000f001','Coach TSP','coach-tsp@example.invalid'),
  ('c0000000-0000-4000-8000-00000000f002','Parent TSP','parent-tsp@example.invalid'),
  ('c0000000-0000-4000-8000-00000000f003','Other Coach TSP','other-coach-tsp@example.invalid'),
  ('c0000000-0000-4000-8000-00000000f004','Quiet Coach TSP','quiet-coach-tsp@example.invalid')
on conflict (id) do nothing;

-- Two synthetic squads in the production admin's club.
insert into teams (id, club_id, name, sort_order, requires_contact)
select 'c0000000-0000-4000-8000-00000000f0f1', club_id, 'ZZ Harness TSP Squad', 994, true from teams order by sort_order limit 1;
insert into teams (id, club_id, name, sort_order, requires_contact)
select 'c0000000-0000-4000-8000-00000000f0f2', club_id, 'ZZ Harness TSP Other', 993, true from teams order by sort_order limit 1;

insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000f001', club_id, id, 'coach','active' from teams where id = 'c0000000-0000-4000-8000-00000000f0f1';
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000f004', club_id, id, 'coach','active' from teams where id = 'c0000000-0000-4000-8000-00000000f0f1';
-- A parent membership must carry a player (memberships_family_role_needs_player).
insert into players (id, club_id, team_id, full_name)
select 'f0000000-0000-4000-8000-0000000000f1', club_id, id, 'Zz Harness TSP Child' from teams where id = 'c0000000-0000-4000-8000-00000000f0f1';
insert into memberships (profile_id, club_id, team_id, role, status, player_id)
select 'c0000000-0000-4000-8000-00000000f002', club_id, id, 'parent','active', 'f0000000-0000-4000-8000-0000000000f1' from teams where id = 'c0000000-0000-4000-8000-00000000f0f1';
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000f003', club_id, id, 'coach','active' from teams where id = 'c0000000-0000-4000-8000-00000000f0f2';

-- Everybody has a phone, including the director.
insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('c0000000-0000-4000-8000-00000000f001', 'https://push.example.invalid/tsp-coach', 'k', 'a'),
  ('c0000000-0000-4000-8000-00000000f002', 'https://push.example.invalid/tsp-parent', 'k', 'a'),
  ('c0000000-0000-4000-8000-00000000f003', 'https://push.example.invalid/tsp-other', 'k', 'a'),
  ('c0000000-0000-4000-8000-00000000f004', 'https://push.example.invalid/tsp-quiet', 'k', 'a'),
  ('df730ef7-dce2-4962-babe-96d9999b0173', 'https://push.example.invalid/tsp-director', 'k', 'a');

-- 5. The category exists — and this is also the quiet coach's opt-out for 1.
do $$ begin
  insert into notification_opt_outs (profile_id, category) values ('c0000000-0000-4000-8000-00000000f004', 'training');
  insert into _r values ('5 training is an accepted opt-out category', 'PASS');
exception when check_violation then insert into _r values ('5 training is an accepted opt-out category', 'FAIL — constraint refused it'); end $$;

-- 1. The audience, in both directions.
do $$ declare eps text[]; begin
  select coalesce(array_agg(endpoint order by endpoint), '{}') into eps
    from training_suggestion_push_subscriptions('c0000000-0000-4000-8000-00000000f0f1', 'df730ef7-dce2-4962-babe-96d9999b0173');
  insert into _r values ('1a the squad coach is told (control)', case when 'https://push.example.invalid/tsp-coach' = any(eps) then 'PASS' else 'FAIL eps='||eps::text end);
  insert into _r values ('1b the director who pressed it is not', case when 'https://push.example.invalid/tsp-director' = any(eps) then 'FAIL' else 'PASS' end);
  insert into _r values ('1c a parent on the squad is not', case when 'https://push.example.invalid/tsp-parent' = any(eps) then 'FAIL' else 'PASS' end);
  insert into _r values ('1d a coach of another squad is not', case when 'https://push.example.invalid/tsp-other' = any(eps) then 'FAIL' else 'PASS' end);
  insert into _r values ('1e a coach who switched training off is not', case when 'https://push.example.invalid/tsp-quiet' = any(eps) then 'FAIL' else 'PASS' end);
  insert into _r values ('1f and that is everybody', case when cardinality(eps) = 1 then 'PASS' else 'FAIL n='||cardinality(eps) end);
end $$;

-- A training event and a template, so suggest_training has something to do.
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000f1', club_id, id, 'training','HARNESS TSP train', now() + interval '2 days' from teams where id = 'c0000000-0000-4000-8000-00000000f0f1';
insert into drills (id, club_id, title, category, minutes)
select 'd0000000-0000-4000-8000-0000000000f1', club_id, 'HARNESS TSP passing', 'skill', 15 from teams limit 1;
insert into session_templates (id, club_id, name, total_minutes)
select 'a0000000-0000-4000-8000-0000000000f1', club_id, 'HARNESS TSP hour', 15 from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes)
values ('a0000000-0000-4000-8000-0000000000f1', 1, 'd0000000-0000-4000-8000-0000000000f1', 15);

-- ⚠️ THE CALL RUNS AS THE ADMIN; THE COUNTING RUNS AS postgres. push_outbox
-- and net.http_request_queue are not readable by `authenticated` (on purpose:
-- members must not see who is told what), so each block switches role only
-- around the suggest_training call and switches back before it counts.
-- 3. Preview queues nothing.
do $$ declare base int; sent int; ob int; begin
  select count(*) into base from net.http_request_queue;
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}''';
  perform suggest_training('a0000000-0000-4000-8000-0000000000f1', array['c0000000-0000-4000-8000-00000000f0f1'::uuid], current_date, current_date + 10, true);
  execute 'reset role';
  select count(*) - base into sent from net.http_request_queue;
  select count(*) into ob from push_outbox where team_id = 'c0000000-0000-4000-8000-00000000f0f1' and category = 'training';
  insert into _r values ('3 a preview queues no push and no outbox row', case when sent = 0 and ob = 0 then 'PASS' else 'FAIL sent='||sent||' outbox='||ob end);
end $$;

-- 2. A real suggest queues exactly one, with the right outbox row.
do $$ declare base int; sent int; ob record; begin
  select count(*) into base from net.http_request_queue;
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}''';
  perform suggest_training('a0000000-0000-4000-8000-0000000000f1', array['c0000000-0000-4000-8000-00000000f0f1'::uuid], current_date, current_date + 10, false);
  execute 'reset role';
  select count(*) - base into sent from net.http_request_queue;
  select * into ob from push_outbox where team_id = 'c0000000-0000-4000-8000-00000000f0f1' and category = 'training' order by created_at desc limit 1;
  insert into _r values ('2 a real suggest queues one push and one training outbox row for the squad',
    case when sent = 1 and ob.id is not null
          and ob.path = '/squad/c0000000-0000-4000-8000-00000000f0f1/training'
          and ob.title like 'Training suggested%ZZ Harness TSP Squad'
          and ob.body like 'The performance director has suggested 1 session,%'
          and ob.actor_id = 'df730ef7-dce2-4962-babe-96d9999b0173'
      then 'PASS' else 'FAIL sent='||sent||' title='||coalesce(ob.title,'null')||' path='||coalesce(ob.path,'null')||' body='||coalesce(ob.body,'null') end);
end $$;

-- 4. Nothing new to suggest → nothing sent.
do $$ declare base int; sent int; begin
  select count(*) into base from net.http_request_queue;
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}''';
  perform suggest_training('a0000000-0000-4000-8000-0000000000f1', array['c0000000-0000-4000-8000-00000000f0f1'::uuid], current_date, current_date + 10, false);
  execute 'reset role';
  select count(*) - base into sent from net.http_request_queue;
  insert into _r values ('4 the same template again sends nothing', case when sent = 0 then 'PASS' else 'FAIL sent='||sent end);
end $$;

select * from _r;

do $$
declare
  _bad text;
  _n int;
begin
  select count(*) into _n from _r;
  if _n = 0 then
    raise exception 'FAIL: this harness recorded NO steps — nothing it claims to test was actually exercised.';
  end if;
  select string_agg(step || ' -> ' || outcome, ' | ') into _bad from _r where outcome like '%FAIL%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;
  raise notice 'SELF-TEST PASSED — % step(s), none reported FAIL.', _n;
end $$;

rollback;
