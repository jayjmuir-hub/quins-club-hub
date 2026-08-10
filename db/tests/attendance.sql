-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — attendance
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK. No user, membership or
--  attendance row survives it, and it can be re-run as often as you like.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. Attendance is the first table in this schema where the
-- READ rule is deliberately narrower than every other team-scoped table:
--
--     everything else   can_see_team    -> a parent sees the whole squad
--     attendance        can_edit_team   -> staff see the squad
--                       OR is_own_player -> a parent sees ONLY their child
--
-- Because "which children miss training, and how often" is a safeguarding-
-- adjacent fact about somebody else's child. If this harness ever shows a
-- parent reading two players' rows, that policy has been widened back to the
-- house style and the reason has been forgotten.
--
-- ⚠️ AND THE WRITE RULE IS THE POINT OF THE FEATURE. A parent must never mark
-- their own child present. The entire value of an attendance number is that
-- somebody other than the interested party recorded it — so `is_own_player`
-- appears in the READ policy and in no write policy at all.
--
-- ⚠️ AS `postgres` (the owner) RLS IS BYPASSED ENTIRELY. A test that forgets
-- `set local role authenticated` passes while proving nothing whatsoever.
-- That is the single easiest way to get a false green here, and this file
-- sets the role explicitly before every assertion.

begin;

-- ── Fixture ────────────────────────────────────────────────────────────────
-- Two players on the SAME squad, so "a parent sees one row, not two" is a real
-- distinction rather than an artefact of there being only one player.

create temp table fx as
select
  (select id from public.teams order by sort_order limit 1)                     as team_id,
  (select id from public.players order by full_name limit 1)                    as player_a,
  (select id from public.players order by full_name offset 1 limit 1)           as player_b;

-- ⚠️ IF THE CLUB HAS FEWER THAN TWO PLAYERS this harness silently stops
-- meaning anything: player_b is null, the second insert does nothing, and
-- "the parent saw 1 row" becomes trivially true. Fail loudly instead.
do $$
begin
  if (select player_b from fx) is null then
    raise exception 'ATTENDANCE HARNESS: needs at least two players to distinguish "filtered" from "there was only one".';
  end if;
end $$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('00000000-aaaa-bbbb-cccc-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','attendance-parent@example.invalid', now(),
        '{"full_name":"Attendance Parent"}'::jsonb, now(), now());

-- A PARENT of player_a only.
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '00000000-aaaa-bbbb-cccc-000000000001', t.club_id, t.id, 'parent',
       (select player_a from fx), 'active'
from public.teams t where t.id = (select team_id from fx);

-- An event on that squad, and a register covering BOTH players, written as
-- the owner so the fixture exists regardless of policy.
insert into public.events (id, club_id, team_id, type, title, starts_at)
select '00000000-aaaa-bbbb-cccc-00000000000e', t.club_id, t.id, 'training',
       'Attendance harness session', now() - interval '1 day'
from public.teams t where t.id = (select team_id from fx);

insert into public.attendance (event_id, player_id, status)
select '00000000-aaaa-bbbb-cccc-00000000000e', player_a, 'present' from fx
union all
select '00000000-aaaa-bbbb-cccc-00000000000e', player_b, 'absent'  from fx;

-- ── Become the parent ──────────────────────────────────────────────────────

select set_config('request.jwt.claims',
       '{"sub":"00000000-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- ── 1. READ: exactly one row, and it is their own child's ─────────────────

do $$
declare visible int; own int;
begin
  select count(*) into visible from public.attendance
   where event_id = '00000000-aaaa-bbbb-cccc-00000000000e';
  select count(*) into own from public.attendance
   where event_id = '00000000-aaaa-bbbb-cccc-00000000000e'
     and player_id = (select player_a from fx);

  if visible <> 1 or own <> 1 then
    raise exception
      'ATTENDANCE READ: a parent saw % row(s) of 2 (own: %). Expected exactly 1, '
      'their own child. can_see_team has probably been substituted for '
      'is_own_player — see the header.', visible, own;
  end if;
  raise notice 'ok  read: a parent sees their own child only';
end $$;

-- ── 2. ⚠️ WRITE: a parent cannot mark their own child ─────────────────────
-- The load-bearing assertion. RLS refuses an INSERT by RAISING, unlike a
-- SELECT which silently filters — so this is a caught exception, not a count.

do $$
begin
  begin
    insert into public.attendance (event_id, player_id, status)
    select '00000000-aaaa-bbbb-cccc-00000000000e', player_a, 'present' from fx;
    raise exception
      'ATTENDANCE WRITE: A PARENT INSERTED AN ATTENDANCE ROW FOR THEIR OWN '
      'CHILD. The whole value of the number is that somebody else recorded it. '
      'is_own_player has leaked into a write policy.';
  exception
    when insufficient_privilege then
      raise notice 'ok  insert: refused for a parent';
    when unique_violation then
      -- Reached the constraint, which means the POLICY let it through.
      raise exception
        'ATTENDANCE WRITE: the insert passed RLS and was stopped only by the '
        'unique constraint. The policy is wrong; the constraint is not a '
        'permission check.';
  end;
end $$;

-- ── 3. WRITE: a parent cannot amend an existing row either ────────────────
-- UPDATE under RLS does NOT raise — a row the policy hides is simply not
-- matched, so this asserts on the row count and never on an exception.

do $$
declare changed int;
begin
  with u as (
    update public.attendance set status = 'excused'
     where event_id = '00000000-aaaa-bbbb-cccc-00000000000e'
     returning 1
  ) select count(*) into changed from u;

  if changed <> 0 then
    raise exception
      'ATTENDANCE WRITE: a parent updated % attendance row(s). A parent may '
      'READ their child''s attendance and must never write it.', changed;
  end if;
  raise notice 'ok  update: changed nothing for a parent';
end $$;

-- ── 4. ⚠️ THE FAULT INJECTION ─────────────────────────────────────────────
-- Everything above is of the form "the parent could NOT do X", and every one
-- of them would pass if the fixture were broken — a mistyped event id, a
-- membership that never inserted, an empty table. This proves the harness can
-- see something it is supposed to see.

reset role;

do $$
declare all_rows int;
begin
  select count(*) into all_rows from public.attendance
   where event_id = '00000000-aaaa-bbbb-cccc-00000000000e';

  if all_rows <> 2 then
    raise exception
      'HARNESS BROKEN: the owner sees % of the 2 fixture rows. Every '
      '"the parent could not" result above was vacuous.', all_rows;
  end if;
  raise notice 'ok  fixture: 2 rows exist, so the refusals above were real';
end $$;

-- ── Undo everything ────────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This inserted an auth user, a membership, an event and two
-- attendance rows into PRODUCTION. They exist until this line runs.

rollback;
