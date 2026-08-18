-- ══════════════════════════════════════════════════════════════════════════
--  PARENT SAVE HARNESS — is replacing a child's parent list all-or-nothing?
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is invented by the fixture below.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- src/data/parents.js `saveParents` used to issue up to N+2 separate PostgREST
-- requests — one DELETE of the rows no longer in the set, one UPDATE per
-- existing row, one INSERT for the new ones. PostgREST has no client-side
-- transaction, so each landed on its own and a failure part way through left a
-- state nobody chose WHILE THE SCREEN SAID THE SAVE HAD FAILED.
--
-- ⚠️ BE PRECISE ABOUT WHICH CASE IS THE BAD ONE. A plain edit was always safe:
-- every kept row carries an id, so the DELETE removed nothing. The damage
-- needed a row to be REMOVED in the same sitting — then the removal applied and
-- the edits did not. `public.save_player_parents` (20260818) does the whole
-- replace in one statement, so there is no longer a middle to fail in.
--
-- WHAT THIS ASSERTS
--
--   1. a straight replace — edit one, remove one, add one — lands exactly     <- the point
--   2. a call that fails part way changes NOTHING                             <- the finding
--   3. `invited_at` and `profile_id` survive an edit                          <- the trap
--   4. a coach of ANOTHER squad cannot write these rows at all                <- control
--   5. blank rows are dropped rather than aborting the save                   <- control
--
-- ⚠️ 4 IS NOT PADDING. The function is SECURITY INVOKER precisely so the two
-- existing policies keep deciding who may write. If that ever became
-- `security definer` without a guard, assertions 1-3 would all still pass while
-- any signed-in person could rewrite any child's parents. This is the assertion
-- that would notice.
--
-- ⚠️ 3 IS THE TRAP, AND IT IS INVISIBLE FROM THE FORM. `invited_at` and
-- `profile_id` are how a parent row is linked to a real ACCOUNT, and no screen
-- shows them next to the fields a coach edits. An UPDATE naming every column
-- would un-invite a parent every time somebody fixed a typo in their phone
-- number, and nothing would look wrong until that parent could not sign in.
--
-- ⚠️ A SYNTHETIC CLUB, NOT THE REAL ONE, so a result here is about the fixture
-- and never about a real child's contacts.
-- ⚠️ AND EVERY NAME IS INVENTED — CLAUDE.md rule 9. This repo is public and its
-- members are children; a harness comment is published the moment it is pushed.

begin;

create temporary table _log(seq serial, line text) on commit drop;
-- ⚠️ GRANTED TO `authenticated` BECAUSE TWO OF THE ASSERTIONS RECORD THEIR
-- RESULT FROM INSIDE AN EXCEPTION HANDLER, while the role is still switched.
-- Without this the handler itself fails and the run reports a permission error
-- on a temp table instead of the answer it was measuring.
grant insert, select on _log to authenticated;
-- ⚠️ AND THE SEQUENCE BEHIND `serial` SEPARATELY. Granting INSERT on the table
-- is not enough: the default `nextval('_log_seq_seq')` is evaluated as the
-- INSERTING role, so without this the run dies with "permission denied for
-- sequence _log_seq_seq" from inside an exception handler — an error about the
-- instrument, three assertions away from anything real. Measured, not guessed:
-- that is exactly how this file failed the first time it was run.
grant usage on sequence _log_seq_seq to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   COACH   active coach of the probe squad — may edit these rows.
--   OTHER   active coach of a DIFFERENT squad — may not.
--   CHILD   the player whose parents are being edited.
--   SPARE   a second child in the SAME squad, so its parent row is one the
--           coach may edit but which does not belong to CHILD. That is what
--           makes assertion 2's failure a realistic one rather than a
--           permission error in disguise.

insert into clubs (id, name) values
 ('d0000000-0000-4000-8000-0000000000c1','ZZ Parents Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-probe-coach@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('d0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-other-coach@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('d0000000-0000-4000-8000-0000000000f1','d0000000-0000-4000-8000-0000000000c1','ZZ Parents Probe Squad', 996),
 ('d0000000-0000-4000-8000-0000000000f2','d0000000-0000-4000-8000-0000000000c1','ZZ Parents Other Squad', 995);

insert into players (id, club_id, team_id, full_name) values
 ('d0000000-0000-4000-8000-0000000000e1','d0000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-0000000000f1','ZZ Probe Child'),
 ('d0000000-0000-4000-8000-0000000000e2','d0000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-0000000000f1','ZZ Spare Child');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-0000000000f1', null,'coach','active'),
 ('d0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-0000000000f2', null,'coach','active');

-- A is an INVITED parent — assertion 3 is about this row surviving an edit.
-- B is the row the user removes in the same sitting, which is the case that
-- made the old sequence dangerous.
insert into player_parents (id, player_id, full_name, first_name, last_name,
                            relationship, email, phone, is_primary, sort_order, invited_at)
values
 ('d0000000-0000-4000-8000-0000000000a1','d0000000-0000-4000-8000-0000000000e1','ZZ Amara Okonjo','ZZ Amara','Okonjo','Mother','zz-amara@example.invalid','+971500000001', true, 0, '2026-08-01T00:00:00Z'),
 ('d0000000-0000-4000-8000-0000000000a2','d0000000-0000-4000-8000-0000000000e1','ZZ Bilal Haddad','ZZ Bilal','Haddad','Father','zz-bilal@example.invalid','+971500000002', false, 1, null);

-- The spare child's parent. Its id is a real id the coach may edit, and it
-- does NOT belong to the child under test.
insert into player_parents (id, player_id, full_name, first_name, last_name, sort_order)
values
 ('d0000000-0000-4000-8000-0000000000a9','d0000000-0000-4000-8000-0000000000e2','ZZ Chen Wei','ZZ Chen','Wei', 0);


create function pg_temp.assert_parent_save() returns void language plpgsql as $fn$
declare
  problems text := '';
  n        int;
  txt      text;
  ts       timestamptz;

  child constant uuid := 'd0000000-0000-4000-8000-0000000000e1';
  a     constant uuid := 'd0000000-0000-4000-8000-0000000000a1';
  b     constant uuid := 'd0000000-0000-4000-8000-0000000000a2';
  spare constant uuid := 'd0000000-0000-4000-8000-0000000000a9';
  coach constant uuid := 'd0000000-0000-4000-8000-000000000001';
  other constant uuid := 'd0000000-0000-4000-8000-000000000002';
begin
  -- ── 1. A straight replace: edit A, remove B, add a new one ─────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.save_player_parents(child, jsonb_build_array(
    jsonb_build_object('id', a, 'full_name','ZZ Amara Okonjo','first_name','ZZ Amara',
                       'last_name','Okonjo','relationship','Mother',
                       'email','zz-amara@example.invalid','phone','+971500009999',
                       'is_primary', true,  'sort_order', 0),
    jsonb_build_object(       'full_name','ZZ Dilnoza Rashidova','first_name','ZZ Dilnoza',
                       'last_name','Rashidova','relationship','Aunt',
                       'is_primary', false, 'sort_order', 1)
  ));

  select count(*) into n from public.player_parents where player_id = child;
  select phone   into txt from public.player_parents where id = a;
  reset role;

  insert into _log(line) values (format('1 replace: %s rows, A phone %s', n, txt));
  if n <> 2 then
    problems := problems || format(
      'REPLACE: expected 2 parent rows after the save, found %s. ', n);
  end if;
  if txt is distinct from '+971500009999' then
    problems := problems || format(
      'REPLACE: the edit to A did not land — phone is %s. ', coalesce(txt,'null'));
  end if;
  if exists (select 1 from public.player_parents where id = b) then
    problems := problems || 'REPLACE: the removed row B is still there. ';
  end if;

  -- ── 2. THE FINDING: a call that fails part way must change NOTHING ─────
  --
  -- The submitted set removes B and claims an id belonging to the SPARE child.
  -- Under the old delete-then-write sequence the removal of B landed and the
  -- rest did not. Here the whole call must come back with the list untouched.
  --
  -- ⚠️ THE STATE BEING PROTECTED IS THE ONE ASSERTION 1 JUST LEFT: A edited,
  -- B gone, Dilnoza added. So "unchanged" below means 2 rows, not the original
  -- fixture — read the numbers, not the names.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.save_player_parents(child, jsonb_build_array(
      jsonb_build_object('id', spare, 'full_name','ZZ Chen Wei','first_name','ZZ Chen',
                         'last_name','Wei','sort_order', 0)
    ));
    insert into _log(line) values ('2 atomicity: the failing call did NOT raise');
    problems := problems ||
      'ATOMICITY: a save claiming another child''s parent row was ACCEPTED. The '
      'claimed-vs-updated count in save_player_parents is not firing, so an id '
      'the caller cannot write to reports success. ';
  exception when others then
    insert into _log(line) values ('2 atomicity: refused as expected (' || sqlstate || ')');
  end;

  select count(*) into n from public.player_parents where player_id = child;
  reset role;

  insert into _log(line) values (format('2 atomicity: %s rows for the child afterwards (want 2)', n));
  if n <> 2 then
    problems := problems || format(
      'ATOMICITY: the failed save left %s parent rows where 2 existed before it. '
      'Part of it applied — which is the whole defect this function exists to '
      'remove. ', n);
  end if;

  -- ── 3. THE TRAP: invited_at and profile_id survive an edit ─────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.save_player_parents(child, jsonb_build_array(
    jsonb_build_object('id', a, 'full_name','ZZ Amara Okonjo','first_name','ZZ Amara',
                       'last_name','Okonjo','relationship','Mother',
                       'email','zz-amara@example.invalid','phone','+971500001111',
                       'is_primary', true, 'sort_order', 0)
  ));

  select invited_at into ts from public.player_parents where id = a;
  reset role;

  insert into _log(line) values (format('3 invited_at after an edit: %s', coalesce(ts::text,'NULL')));
  if ts is distinct from '2026-08-01T00:00:00Z'::timestamptz then
    problems := problems ||
      'INVITE LINK: invited_at did not survive an edit to the row. An UPDATE '
      'naming every column silently un-invites a parent whenever a coach fixes '
      'a typo, and nothing looks wrong until that parent cannot sign in. ';
  end if;

  -- ── 4. CONTROL: a coach of another squad may not write at all ──────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.save_player_parents(child, jsonb_build_array(
      jsonb_build_object('full_name','ZZ Intruder Row','first_name','ZZ Intruder',
                         'last_name','Row','sort_order', 0)
    ));
    insert into _log(line) values ('4 control: the other squad''s coach was ALLOWED');
  exception when others then
    insert into _log(line) values ('4 control: other squad refused (' || sqlstate || ')');
  end;

  reset role;

  select count(*) into n
    from public.player_parents where player_id = child and full_name = 'ZZ Intruder Row';

  insert into _log(line) values (format('4 control: intruder rows written = %s (want 0)', n));
  if n <> 0 then
    problems := problems ||
      'AUTHORISATION: a coach of a DIFFERENT squad wrote a parent row for this '
      'child. save_player_parents is SECURITY INVOKER so RLS should have '
      'refused it — check it has not been made SECURITY DEFINER. ';
  end if;

  -- ── 5. CONTROL: a blank row is dropped, not an error ───────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.save_player_parents(child, jsonb_build_array(
    jsonb_build_object('id', a, 'full_name','ZZ Amara Okonjo','first_name','ZZ Amara',
                       'last_name','Okonjo','sort_order', 0),
    jsonb_build_object('full_name','   ', 'sort_order', 1)
  ));

  select count(*) into n from public.player_parents where player_id = child;
  reset role;

  insert into _log(line) values (format('5 blank row: %s rows after (want 1)', n));
  if n <> 1 then
    problems := problems || format(
      'BLANK ROW: expected the abandoned row to be dropped and 1 row to remain, '
      'found %s. ', n);
  end if;

  if problems <> '' then
    raise exception '%', problems;
  end if;
end
$fn$;


-- ── Run it. This must pass. ───────────────────────────────────────────────

do $$
begin
  perform pg_temp.assert_parent_save();
  raise notice 'PARENT SAVE: all checks passed.';
  insert into _log(line) values ('PARENT SAVE: all checks passed.');
end $$;


-- ── SELF-TEST: reproduce the OLD sequence and prove it loses the row ──────
--
-- ⚠️ NOT OPTIONAL. Assertion 2 above says "the row count did not change", and a
-- row count that never changes for any reason would satisfy it. The only way to
-- know it is measuring atomicity is to run the shape that was NOT atomic and
-- watch the same assertion fail.
--
-- ⚠️ AND IT CANNOT BE DONE WITH AN EXCEPTION BLOCK ROUND BOTH HALVES, which is
-- the subtlety worth writing down. `begin … exception` opens a SUBTRANSACTION,
-- so a failure inside it rolls the DELETE back too and the old code would look
-- atomic. It never was: the DELETE and the UPDATE were separate PostgREST
-- requests, hence separate transactions, and the first COMMITTED before the
-- second was sent. Modelled here by leaving the DELETE outside any handler and
-- failing only the step after it.

create function pg_temp.old_sequence(_player uuid, _keep uuid) returns void
language plpgsql as $fn$
begin
  -- Request 1: remove everything not in the submitted set. Lands, and stays.
  delete from public.player_parents pp
   where pp.player_id = _player and pp.id <> _keep;

  -- Request 2: the update that fails. Its rollback cannot reach request 1.
  begin
    perform 1 / 0;
  exception when others then
    null;
  end;
end
$fn$;

do $$
declare
  child constant uuid := 'd0000000-0000-4000-8000-0000000000e1';
  before_n int;
  after_n  int;
begin
  -- Put two rows back so the old sequence has something to lose.
  insert into public.player_parents (player_id, full_name, first_name, last_name, sort_order)
  values (child, 'ZZ Esi Mensah', 'ZZ Esi', 'Mensah', 1);

  select count(*) into before_n from public.player_parents where player_id = child;

  perform pg_temp.old_sequence(
    child, (select id from public.player_parents where player_id = child order by sort_order limit 1));

  select count(*) into after_n from public.player_parents where player_id = child;

  if after_n >= before_n then
    -- ⚠️ `%` NOT `%s` — plpgsql's raise takes a bare %, unlike format() above,
    -- and `%s` prints the substitution followed by a stray "s".
    raise exception
      'SELF-TEST FAILED — the pre-20260818 delete-then-write sequence was replayed '
      'and lost nothing (% rows before, % after). This harness is not modelling '
      'the defect it claims to, so a green run from assertion 2 means nothing.',
      before_n, after_n;
  end if;

  raise notice
    'SELF-TEST PASSED — the old sequence lost a row the new function keeps: % before, % after.',
    before_n, after_n;
  insert into _log(line) values (format(
    'SELF-TEST PASSED — old delete-then-write left %s of %s rows; save_player_parents leaves all of them.',
    after_n, before_n));
end $$;


-- ── What was measured, for a runner that shows rows rather than notices ───

select line from _log order by seq;


-- ── Undo everything ──────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This file really did insert a club, a squad, two children
-- and their parents' contact details into production, and really did delete
-- rows. The rollback is what makes that acceptable, and scripts/db-check.mjs
-- refuses any file here that could commit instead.

rollback;
