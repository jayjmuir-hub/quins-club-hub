-- ══════════════════════════════════════════════════════════════════════════
--  Senior divisions — the league team's division and the fixture's tier admit
--  the senior competitions, not only the junior letters
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 3 Sep 2026, putting the 2026–27 senior schedules onto Club Hub: the
-- RCM men's grid has our sides in the West Asia Premiership, Division 1 and
-- Division 2, and the senior women play a 7s league and a XVs league. The
-- junior model (20260812_league_teams.sql) stores WHICH side plays in WHICH
-- division as a letter — A, B, C (Jay, 11 Aug 2026: "each age group has 3
-- divisions") — and 20260814_tiers_and_player_grades.sql copies the same
-- letter onto the fixture as its tier. Both checks refused everything else,
-- so a senior league team could not be entered at all.
--
-- ⚠️ CODES, NOT NAMES. 'WAP', 'D1', 'D2', 'W7s', 'WXV'. The words a reader
-- sees ("Premiership", "Division 1", "Women's XVs") are derived in ONE place,
-- src/lib/division.js, with a copy in the calendar edge function. A name in
-- the column would be typed three ways within a season; a code is checked.
--
-- ⚠️ THE TWO LISTS ARE THE SAME LIST ON PURPOSE, plus 'TBD' on the tier, which
-- 20260901_league_placeholders.sql added and which is not a division. The
-- event form prefills the tier FROM the league team's division, so any code
-- the first check admits must be admissible by the second or the prefill
-- writes a row the database refuses.
--
-- ⚠️ JUNIOR GRADES ARE UNTOUCHED. player_grades_tier_check stays ('A','B','C');
-- a child's grade is a coach's judgement on the junior scale, and no senior
-- code belongs on it. src/lib/tierEligibility.js ranks only A, B and C and is
-- silent for any other code, so a senior fixture never invents a warning.
--
-- ⚠️ NOTHING IS BACKFILLED and no row changes. Every existing division is a
-- letter and every existing tier is a letter or 'TBD'; both remain admitted.
--
-- ⚠️ NO GRANT NEEDED — no new column, no new table (db/schema/grants.sql).

alter table public.league_teams
  drop constraint if exists league_teams_division_check;

alter table public.league_teams
  add constraint league_teams_division_check
  check (division in ('A', 'B', 'C', 'WAP', 'D1', 'D2', 'W7s', 'WXV'));

comment on column public.league_teams.division is
  'Division code: A/B/C for a junior side, WAP/D1/D2 for the senior men, W7s/WXV for the senior women. Labels live in src/lib/division.js. Null = entered in no division.';

alter table public.events
  drop constraint if exists events_tier_check;

alter table public.events
  add constraint events_tier_check
  check (tier is null or tier in ('A', 'B', 'C', 'TBD', 'WAP', 'D1', 'D2', 'W7s', 'WXV'));

-- ── Assert it landed, both constraints ────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.league_teams'::regclass
       and conname = 'league_teams_division_check'
       and pg_get_constraintdef(oid) like '%WXV%'
  ) then
    raise exception 'league_teams_division_check was not widened to the senior codes';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass
       and conname = 'events_tier_check'
       and pg_get_constraintdef(oid) like '%WXV%'
       and pg_get_constraintdef(oid) like '%TBD%'
  ) then
    raise exception 'events_tier_check was not widened to the senior codes (or lost TBD)';
  end if;
end $$;
