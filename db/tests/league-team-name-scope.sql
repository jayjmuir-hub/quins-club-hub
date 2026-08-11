-- A league team's name is unique WITHIN A SQUAD, and must not be unique across
-- the club. Run against live; it rolls back and leaves nothing behind.
--
-- ⚠️ THIS HARNESS EXISTS BECAUSE THE ORIGINAL CONSTRAINT WAS WRONG AND NOTHING
-- CAUGHT IT. `unique (club_id, rcm_name)` shipped on 12 Aug 2026 and was found
-- the same day by Jay using the app: he added ADHQ1 to U16B, then could not add
-- ADHQ1 to U14B. Every age group has its own ADHQ1/ADHQ2/ADHQ3, one per
-- division, so the name only identifies a team within an age group.
--
-- ⚠️ IT ASSERTS BOTH DIRECTIONS ON PURPOSE. A test that only proved the second
-- squad is now allowed would pass equally against a table with NO unique
-- constraint at all — which would let one squad hold two ADHQ1s, and the event
-- form's picker cannot tell those apart.
--
-- Run:  paste into the Supabase SQL editor, or apply through execute_sql.
-- Expect: two `ok:` notices and no exception. Any exception is a failure.

begin;

do $$
declare
  squad_a uuid;
  squad_b uuid;
  club    uuid;
begin
  -- Two different squads from the same club. Named by sort order rather than by
  -- name so the harness does not break when a squad is renamed.
  select t.id, t.club_id into squad_a, club
    from public.teams t order by t.sort_order, t.name limit 1;
  select t.id into squad_b
    from public.teams t where t.id <> squad_a order by t.sort_order, t.name limit 1;

  if squad_b is null then
    raise exception 'ABORTING: this harness needs two squads and the club has one';
  end if;

  insert into public.league_teams (club_id, team_id, rcm_name, division)
  values (club, squad_a, 'HARNESS-SAME-NAME', 'A');

  -- 1. THE SAME NAME IN A DIFFERENT SQUAD MUST BE ACCEPTED.
  begin
    insert into public.league_teams (club_id, team_id, rcm_name, division)
    values (club, squad_b, 'HARNESS-SAME-NAME', 'A');
    raise notice 'ok: the same name is accepted in a different squad';
  exception when unique_violation then
    raise exception 'FAILED: the name is still unique per CLUB, not per squad';
  end;

  -- 2. THE SAME NAME TWICE IN ONE SQUAD MUST STILL BE REFUSED.
  --    ⚠️ Asserted as unique_violation SPECIFICALLY. A refusal for any other
  --    reason — a mistyped column, an RLS denial — would otherwise read as
  --    "the constraint works".
  begin
    insert into public.league_teams (club_id, team_id, rcm_name, division)
    values (club, squad_a, 'HARNESS-SAME-NAME', 'B');
    raise exception 'FAILED: one squad was allowed two teams with the same name';
  exception when unique_violation then
    raise notice 'ok: a duplicate name within one squad is still refused (23505)';
  end;
end $$;

-- ⚠️ NEVER LEAVE ROWS BEHIND. Everything above is inside this transaction.
rollback;
