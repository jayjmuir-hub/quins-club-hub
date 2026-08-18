-- ══════════════════════════════════════════════════════════════════════════
--  HEAD-COACH FLAG HARNESS — does the flag hold the guarantees the notify
--  functions are about to rely on?
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is invented by the fixture below.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 18 Aug 2026. The approval e-mails go to every club admin and every coach and
-- manager on the squad. Jay: only super admins, the head coach, and the team
-- manager(s). "Head coach" had no representation in the database — it lived in
-- `memberships.title`, which is FREE TEXT with zero check constraints and
-- already holds 'Assistant Coach/Medic' on production. Matching a string a
-- human typed would mean an approval e-mail silently not sent, which nobody
-- would ever notice. db/migrations/20260818_membership_head_coach.sql adds the
-- flag; this file is what says the flag is worth trusting.
--
-- ⚠️ IT APPLIES THE MIGRATION ITSELF, INSIDE THE TRANSACTION. That is
-- deliberate: the file tests the migration AS WRITTEN against the real table,
-- including the backfill running over real titles, and the rollback takes all
-- of it away again. Once the migration is applied for real, re-applying it here
-- is a no-op (`if not exists` throughout) and the assertions keep working.
--
-- WHAT THIS ASSERTS
--
--   1. the backfill flags a coach titled 'Head Coach'          <- the point
--   2. it does NOT flag the untitled coach on the same squad   <- control
--   3. a SECOND head coach on one squad is refused             <- Jay's ruling
--   4. flagging a non-coach is refused                         <- integrity
--   5. `authenticated` may write is_head_coach                 <- the feature
--   6. `authenticated` may NOT write is_super                  <- the trap
--
-- ⚠️ 2 IS NOT PADDING. Without it, a backfill that flagged EVERY coach would
-- pass 1 and hand the notify functions the same over-sending this is meant to
-- end. ⚠️ AND 6 IS THE ONE THAT MATTERS MOST: the column grant exists because
-- `grant update on public.memberships to authenticated` would let any admin
-- make themselves a super admin. 5 alone is satisfied by that disaster.
-- CLAUDE.md rule 6.
--
-- ⚠️ THESE SIX WERE WRITTEN AS SELECTS AND JUDGED BY EYE UNTIL 18 Aug 2026.
-- The answers were printed with an "EXPECTED:" comment above them and nothing
-- compared the two, so a wrong answer read as a pass. They are now asserted,
-- with `raise exception`, in section 4 below — see the note there for why that
-- stopped every OTHER harness in this directory from running as well.

begin;

-- ── fixture — invented, and named so it cannot be mistaken for a real family ──
insert into clubs (id, name) values
 ('c0000000-0000-4000-8000-0000000000c1','ZZ Head Coach Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('c0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-head@example.invalid',      now(), '{}'::jsonb, now(), now()),
 ('c0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-assistant@example.invalid', now(), '{}'::jsonb, now(), now()),
 ('c0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-admin@example.invalid',     now(), '{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('c0000000-0000-4000-8000-0000000000f1','c0000000-0000-4000-8000-0000000000c1','ZZ Probe Squad', 997);

-- A squad with a titled head coach AND an assistant. ⚠️ THAT PAIR IS THE WHOLE
-- POINT: a fixture with one coach passes whether the flag discriminates or not.
insert into memberships (id, profile_id, club_id, team_id, role, status, title) values
 ('c0000000-0000-4000-8000-0000000000a1','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-0000000000f1','coach','active','Head Coach'),
 ('c0000000-0000-4000-8000-0000000000a2','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-0000000000f1','coach','active','Assistant Coach'),
 ('c0000000-0000-4000-8000-0000000000a3','c0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-0000000000c1', null,'admin','active', null);

-- ── the migration under test, verbatim ──────────────────────────────────────
alter table public.memberships
  add column if not exists is_head_coach boolean not null default false;

update public.memberships m
   set is_head_coach = true
  from (
    select distinct on (team_id) id
      from public.memberships
     where status = 'active' and role = 'coach' and team_id is not null
       and title ilike '%head coach%'
     order by team_id, id
  ) pick
 where m.id = pick.id;

alter table public.memberships
  drop constraint if exists memberships_head_coach_is_a_squad_coach;
alter table public.memberships
  add constraint memberships_head_coach_is_a_squad_coach
  check (not is_head_coach or (role = 'coach' and team_id is not null));

create unique index if not exists memberships_one_head_coach_per_team
  on public.memberships (team_id) where is_head_coach;

grant update (is_head_coach) on public.memberships to authenticated;

-- ── the checks, callable twice so the fault injection can re-run them ────────
create or replace function pg_temp.head_coach_checks()
returns table (check_name text, result text) language plpgsql as $fn$
begin
  check_name := '1 backfill flags the titled head coach';
  result := case when (select is_head_coach from memberships
                        where id = 'c0000000-0000-4000-8000-0000000000a1')
                 then 'FLAGGED' else 'not flagged' end;
  return next;

  check_name := '2 assistant on the same squad untouched';
  result := case when (select is_head_coach from memberships
                        where id = 'c0000000-0000-4000-8000-0000000000a2')
                 then 'FLAGGED' else 'not flagged' end;
  return next;

  check_name := '3 a second head coach on the squad';
  begin
    update memberships set is_head_coach = true
     where id = 'c0000000-0000-4000-8000-0000000000a2';
    result := 'ALLOWED';
    -- undo, so the checks after this one see the intended state
    update memberships set is_head_coach = false
     where id = 'c0000000-0000-4000-8000-0000000000a2';
  exception when others then result := 'refused (' || sqlstate || ')';
  end;
  return next;

  check_name := '4 flagging a non-coach';
  begin
    update memberships set is_head_coach = true
     where id = 'c0000000-0000-4000-8000-0000000000a3';
    result := 'ALLOWED';
    update memberships set is_head_coach = false
     where id = 'c0000000-0000-4000-8000-0000000000a3';
  exception when others then result := 'refused (' || sqlstate || ')';
  end;
  return next;

  check_name := '5 authenticated may write is_head_coach';
  result := case when has_column_privilege('authenticated','public.memberships','is_head_coach','UPDATE')
                 then 'GRANTED' else 'refused' end;
  return next;

  check_name := '6 authenticated may NOT write is_super';
  result := case when has_column_privilege('authenticated','public.memberships','is_super','UPDATE')
                 then 'GRANTED' else 'refused' end;
  return next;
end $fn$;

-- ── 4. run it unmodified, and JUDGE the answers ─────────────────────────────
--
-- ⚠️ THE `raise exception` BELOW IS THE POINT OF THIS SECTION, AND ITS ABSENCE
-- MADE THIS FILE — AND EVERY OTHER HARNESS — UNRUNNABLE FOR A DAY.
-- Until 18 Aug 2026 the two runs below were bare SELECTs with an "EXPECTED:"
-- comment above them. scripts/db-check.mjs throws on a SQL error and on nothing
-- else, so a wrong answer printed a row and the runner said `ok`. A human had
-- to read six strings and compare them against a comment, which is exactly the
-- silence `claude/runbooks/db-harnesses.md` was written about.
-- ⚠️ AND THE COST WAS NOT LIMITED TO THIS FILE. The runner checks every harness
-- BEFORE it connects and refuses the whole run if one cannot fail — so this
-- file's missing `raise exception` stopped `npm run db:check` from running any
-- of them. Nothing went red, because .github/workflows/db-check.yml is inert
-- without a SUPABASE_DB_URL secret and reports "did not run".

create temporary table _r(phase text, check_name text, result text) on commit drop;

insert into _r select 'unmodified', * from pg_temp.head_coach_checks();

do $$
declare
  problems text := '';
  got      text;

  -- The expected answers, in one place so the verdict below reads as a table
  -- rather than as six paragraphs of prose.
  expected constant text[][] := array[
    ['1 backfill flags the titled head coach',  'FLAGGED'         ],
    ['2 assistant on the same squad untouched', 'not flagged'     ],
    ['3 a second head coach on the squad',      'refused (23505)' ],  -- unique index
    ['4 flagging a non-coach',                  'refused (23514)' ],  -- check constraint
    ['5 authenticated may write is_head_coach', 'GRANTED'         ],
    ['6 authenticated may NOT write is_super',  'refused'         ]
  ];
begin
  for i in 1 .. array_length(expected, 1) loop
    select result into got from _r
     where phase = 'unmodified' and check_name = expected[i][1];

    if got is distinct from expected[i][2] then
      problems := problems || format(
        'HEAD COACH: "%s" answered %s, expected %s. ',
        expected[i][1], coalesce(got, 'NOTHING AT ALL'), expected[i][2]);
    end if;
  end loop;

  -- ⚠️ THE SQLSTATES ARE PART OF THE ASSERTION, NOT DECORATION. 23505 is the
  -- unique index refusing a second head coach and 23514 is the CHECK refusing
  -- a non-coach. A fix that swapped one guarantee for the other would leave
  -- both lines reading "refused" and this file would not notice.
  if problems <> '' then
    raise exception '%', problems;
  end if;

  raise notice 'HEAD COACH: all checks passed.';
end $$;

-- ── 5. inject the real fault: remove the one-per-squad guarantee ────────────
--
-- ⚠️ NOT OPTIONAL. Every assertion above is of the form "this is refused", and
-- a typo'd id or a renamed constraint makes them all vacuously true. The only
-- way to know the check works is to break the thing on purpose and watch the
-- answer change. CLAUDE.md rule 6.

drop index if exists memberships_one_head_coach_per_team;
insert into _r select 'index dropped', * from pg_temp.head_coach_checks();

do $$
declare
  got  text;
  ctl  text;
begin
  select result into got from _r
   where phase = 'index dropped' and check_name = '3 a second head coach on the squad';

  -- The control: dropping the INDEX must not change what the CHECK CONSTRAINT
  -- refuses. If assertion 4 moved as well, the fault injected was broader than
  -- the one named and check 3 flipping proves nothing about the index.
  select result into ctl from _r
   where phase = 'index dropped' and check_name = '4 flagging a non-coach';

  if got is distinct from 'ALLOWED' then
    raise exception
      'SELF-TEST FAILED — the one-head-coach-per-squad index was dropped and a '
      'second head coach was still %. So the index is NOT what refuses one, and '
      'assertion 3 above is passing for some other reason. Do not trust a green '
      'run from this file until that is understood.', coalesce(got, 'not measured');
  end if;

  if ctl is distinct from 'refused (23514)' then
    raise exception
      'SELF-TEST FAILED — dropping the index also changed assertion 4 (now %). '
      'The injected fault was wider than the one named, so check 3 flipping says '
      'nothing about the index specifically.', coalesce(ctl, 'not measured');
  end if;

  raise notice
    'SELF-TEST PASSED — the check caught it: with the index dropped, a second '
    'head coach was ALLOWED, while the non-coach constraint still refused.';
end $$;

-- ── 6. what was measured, for a runner that shows rows rather than notices ──
select phase, check_name, result from _r order by phase desc, check_name;

-- ⚠️ THE ROLLBACK IS NOT TIDINESS. Section 5 really did DROP an index from
-- public.memberships on production, and the fixture really did insert a club,
-- a squad and three memberships. scripts/db-check.mjs refuses any file here
-- that could commit instead.
rollback;
