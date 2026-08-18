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

-- ── 4. run it unmodified ────────────────────────────────────────────────────
-- EXPECTED: FLAGGED / not flagged / refused (23505) / refused (23514) /
--           GRANTED / refused
select 'unmodified' as pass, * from pg_temp.head_coach_checks();

-- ── 5. inject the real fault: remove the one-per-squad guarantee ────────────
-- EXPECTED: check 3 flips to ALLOWED. If it does not, this file is not testing
-- what it claims, and the index is not what refuses the second head coach.
drop index if exists memberships_one_head_coach_per_team;
select 'index dropped' as pass, * from pg_temp.head_coach_checks();

rollback;
