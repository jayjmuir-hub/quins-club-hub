-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — claiming a roster row that a parent already made
--  (db/migrations/20260904_claim_existing_player.sql).
--  Paste into the Supabase SQL editor, or run `npm run db:check`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS
--  BACK, and every person and squad below is INVENTED — rule 9.
-- ══════════════════════════════════════════════════════════════════════════
--
--   1. In-app claim by the player: a pending PLAYER membership on the
--      parent-made row, and the roster grows by ZERO rows.
--   2. Claiming again returns the same membership — no second one.
--   3. A name that is not on the roster is refused with 42704 (add as new).
--   4. In-app claim by a parent: a pending PARENT membership plus a parent
--      row carrying the parent's email — and NO parent row for the player
--      who claimed themselves in step 1.
--   5. The wizard route: an intent with self_register on the same name
--      claims the row (membership yes, roster +0), while an intent with a
--      NEW name still creates a row (control, roster +1).
--   6. Two live rows with the same name: the in-app claim is refused with
--      42710 rather than guessing.

begin;
create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
  ('c0000000-0000-4000-8000-00000000c101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim-player@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000c102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim-parent@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000c103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim-wizard@example.invalid', now(), '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-00000000c104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim-wizard-new@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values
  ('c0000000-0000-4000-8000-00000000c101','Zz Harness Claimchild','claim-player@example.invalid'),
  ('c0000000-0000-4000-8000-00000000c102','Zz Harness Claimparent','claim-parent@example.invalid'),
  ('c0000000-0000-4000-8000-00000000c103','Zz Harness Claimchild','claim-wizard@example.invalid'),
  ('c0000000-0000-4000-8000-00000000c104','Zz Harness Newname','claim-wizard-new@example.invalid')
on conflict (id) do nothing;

-- A youth squad that allows self-registration, with one parent-made row.
insert into teams (id, club_id, name, sort_order, requires_contact, self_registration_allowed)
select 'c0000000-0000-4000-8000-00000000c1f1', club_id, 'ZZ Harness Claim Squad', 995, false, true from teams order by sort_order limit 1;
insert into players (id, club_id, team_id, full_name)
select 'f0000000-0000-4000-8000-0000000000c1', club_id, id, 'Zz Harness Claimchild' from teams where id = 'c0000000-0000-4000-8000-00000000c1f1';

-- 1. the player claims their own row
do $$ declare before int; after int; m memberships; begin
  select count(*) into before from players where team_id = 'c0000000-0000-4000-8000-00000000c1f1';
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000c101","role":"authenticated"}''';
  select * into m from claim_existing_player('Zz Harness Claimchild', 'c0000000-0000-4000-8000-00000000c1f1', true);
  execute 'reset role';
  select count(*) into after from players where team_id = 'c0000000-0000-4000-8000-00000000c1f1';
  insert into _r values ('1 the player claims the parent-made row: pending player membership, roster +0',
    case when m.role = 'player' and m.status = 'pending' and m.player_id = 'f0000000-0000-4000-8000-0000000000c1' and after = before
         then 'PASS' else 'FAIL role=' || coalesce(m.role,'null') || ' status=' || coalesce(m.status,'null') || ' rows ' || before || '->' || after end);
exception when others then execute 'reset role'; insert into _r values ('1 the player claims the parent-made row', 'FAIL ' || sqlerrm); end $$;

-- 2. idempotent
do $$ declare n1 int; n2 int; begin
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000c101","role":"authenticated"}''';
  perform claim_existing_player('Zz Harness Claimchild', 'c0000000-0000-4000-8000-00000000c1f1', true);
  execute 'reset role';
  select count(*) into n1 from memberships where profile_id = 'c0000000-0000-4000-8000-00000000c101';
  insert into _r values ('2 claiming again makes no second membership', case when n1 = 1 then 'PASS' else 'FAIL n=' || n1 end);
exception when others then execute 'reset role'; insert into _r values ('2 claiming again', 'FAIL ' || sqlerrm); end $$;

-- 3. nobody by that name
do $$ begin
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000c101","role":"authenticated"}''';
  perform claim_existing_player('Zz Harness Nobody', 'c0000000-0000-4000-8000-00000000c1f1', true);
  execute 'reset role';
  insert into _r values ('3 a name not on the roster is refused', 'FAIL — it was accepted');
exception when others then execute 'reset role';
  insert into _r values ('3 a name not on the roster is refused with 42704', case when sqlstate = '42704' then 'PASS' else 'FAIL ' || sqlstate || ' ' || sqlerrm end);
end $$;

-- 4. a parent claims the same child
do $$ declare m memberships; prow int; selfrow int; begin
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000c102","role":"authenticated"}''';
  select * into m from claim_existing_player('Zz Harness Claimchild', 'c0000000-0000-4000-8000-00000000c1f1', false);
  execute 'reset role';
  select count(*) into prow from player_parents where player_id = 'f0000000-0000-4000-8000-0000000000c1' and email = 'claim-parent@example.invalid';
  select count(*) into selfrow from player_parents where player_id = 'f0000000-0000-4000-8000-0000000000c1' and email = 'claim-player@example.invalid';
  insert into _r values ('4a a parent claim is a pending parent membership on the same row', case when m.role = 'parent' and m.status = 'pending' and m.player_id = 'f0000000-0000-4000-8000-0000000000c1' then 'PASS' else 'FAIL role=' || coalesce(m.role,'null') end);
  insert into _r values ('4b and leaves a parent row with the parent''s email', case when prow = 1 then 'PASS' else 'FAIL n=' || prow end);
  insert into _r values ('4c while the self-claim in step 1 left NO self-parent row', case when selfrow = 0 then 'PASS' else 'FAIL n=' || selfrow end);
exception when others then execute 'reset role'; insert into _r values ('4 a parent claim', 'FAIL ' || sqlerrm); end $$;

-- 5. the wizard route
update profiles set signup_intent = jsonb_build_object('v',1,'answers',jsonb_build_object('self',true),'players',
  jsonb_build_array(jsonb_build_object('first_name','Zz Harness','last_name','Claimchild','team_id','c0000000-0000-4000-8000-00000000c1f1','self_register','true','confirm_duplicate','false')))
 where id = 'c0000000-0000-4000-8000-00000000c103';
update profiles set signup_intent = jsonb_build_object('v',1,'answers',jsonb_build_object('self',true),'players',
  jsonb_build_array(jsonb_build_object('first_name','Zz Harness','last_name','Newname','team_id','c0000000-0000-4000-8000-00000000c1f1','self_register','true','confirm_duplicate','false')))
 where id = 'c0000000-0000-4000-8000-00000000c104';
do $$ declare before int; mid int; after int; m memberships; begin
  select count(*) into before from players where team_id = 'c0000000-0000-4000-8000-00000000c1f1';
  perform private.apply_signup_intent('c0000000-0000-4000-8000-00000000c103');
  select count(*) into mid from players where team_id = 'c0000000-0000-4000-8000-00000000c1f1';
  select * into m from memberships where profile_id = 'c0000000-0000-4000-8000-00000000c103';
  insert into _r values ('5a a sign-up intent on an existing name claims the row: membership yes, roster +0',
    case when m.role = 'player' and m.player_id = 'f0000000-0000-4000-8000-0000000000c1' and mid = before then 'PASS' else 'FAIL role=' || coalesce(m.role,'null') || ' rows ' || before || '->' || mid end);
  perform private.apply_signup_intent('c0000000-0000-4000-8000-00000000c104');
  select count(*) into after from players where team_id = 'c0000000-0000-4000-8000-00000000c1f1';
  insert into _r values ('5b (control) a NEW name via the same route still creates a row, roster +1', case when after = mid + 1 then 'PASS' else 'FAIL rows ' || mid || '->' || after end);
exception when others then insert into _r values ('5 the wizard route', 'FAIL ' || sqlerrm); end $$;

-- 6. two live rows with one name: refuse, do not guess
insert into players (id, club_id, team_id, full_name)
select 'f0000000-0000-4000-8000-0000000000c2', club_id, id, 'Zz Harness Claimchild' from teams where id = 'c0000000-0000-4000-8000-00000000c1f1';
do $$ begin
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000c102","role":"authenticated"}''';
  -- c102 already holds a membership on the first row, so use a fresh claimer: c104 (whose own name differs — the claim is by the NAME typed)
  execute 'set local request.jwt.claims = ''{"sub":"c0000000-0000-4000-8000-00000000c104","role":"authenticated"}''';
  perform claim_existing_player('Zz Harness Claimchild', 'c0000000-0000-4000-8000-00000000c1f1', false);
  execute 'reset role';
  insert into _r values ('6 two rows with one name', 'FAIL — it picked one');
exception when others then execute 'reset role';
  insert into _r values ('6 two rows with one name are refused with 42710', case when sqlstate = '42710' then 'PASS' else 'FAIL ' || sqlstate || ' ' || sqlerrm end);
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
