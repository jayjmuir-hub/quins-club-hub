-- ══════════════════════════════════════════════════════════════════════════
--  Seed — the 2026–27 senior fixtures, men and women
-- ══════════════════════════════════════════════════════════════════════════
--
-- A ONE-OFF DATA LOAD, not a migration and not a harness: it writes rows, it
-- changes no schema, and it is meant to run once. It lives in db/seeds/ so
-- that the shape of what was loaded is on record, and so the next season's
-- load starts from a file rather than from a form, fifty-three times.
--
-- Source: the RCM 2026–27 Senior Men's grid (PDF, three divisions, flattened
-- to text and re-read column by column — each division decided by which clubs
-- appear in it, since the flattening loses column positions) and the Senior
-- Women's dates poster. Jay, 3 Sep 2026, with three rulings:
--   • the JA away game in the Premiership is FRIDAY 23 Oct, a night game;
--   • the two Doha games are REVERSED from the grid — away in Nov, home in Mar;
--   • the women's poster has no W7s Round 4, and that is not to be chased.
--
-- ⚠️ SATURDAY IS THE DEFAULT DAY. The grid gives a weekend per round, not a
-- day. Jay's note that JA moves to Friday "instead of Saturday" is the rule:
-- every league round goes in on the Saturday with Time TBD. The poster's
-- weekday labels are wrong twice (31 Jan 2027 is a Sunday, 27 Feb 2027 a
-- Saturday); the DATES are used, the labels ignored.
--
-- ⚠️ BYES ARE NOT ROWS. A bye is the absence of a fixture, and a placeholder
-- row would put "Round 1" on a schedule with nothing to be available for.
--
-- ⚠️ THE WOMEN'S 7s ROUNDS ARE TOURNAMENT CONTAINERS, NOT LEAGUE ROWS.
-- events_league_is_fifteen refuses a league row in any format but 15 — a
-- junior ruling (claude/plans/2026-09-02-fixture-format.md) that the senior
-- women's 7s league contradicts. A 7s round day is several games, which is
-- exactly what a container is (claude/plans/2026-08-29-tournaments-as-
-- containers.md), so each round is a container named "W7s Round n" in 7s
-- format and the games go under it on the day. Dubai 7s is three containers,
-- one per day, because a container is a DAY and time-TBD rows may carry no end.
--
-- ⚠️ ONE INSERT STATEMENT FOR EVERY EVENT, DELIBERATELY. fixture_added_push is
-- a per-STATEMENT trigger that pushes only when exactly one row was inserted;
-- a bulk load must not wake every senior player fifty times. And the squads
-- it creates have no players yet in any case.
--
-- ⚠️ IDEMPOTENT ON THE SQUADS AND LEAGUE TEAMS, NOT ON THE EVENTS. Squads and
-- sides are looked up by name and created only if missing; the events are
-- inserted unconditionally. Run it twice and the fixtures double. The dry run
-- (append `raise exception` inside the block, or wrap in begin/rollback)
-- exists so that it is run for real exactly once.
--
-- Requires db/migrations/20260904_senior_divisions.sql to have been applied.

do $$
declare
  club   constant uuid := '00000000-0000-0000-0000-0000000000ad';
  men1   uuid;
  men2   uuid;
  men3   uuid;
  women  uuid;
  lt_wap uuid;
  lt_d1  uuid;
  lt_d2  uuid;
  lt_wxv uuid;
  made   integer;
begin
  -- ── Squads ──────────────────────────────────────────────────────────────
  -- Mirrors public.create_team(): next sort_order in the club, senior, jersey
  -- numbers on, self-registration open — the same answers the 1st XV carries.
  select id into men1 from public.teams where club_id = club and name = 'Senior Men - 1st XV';
  if men1 is null then
    raise exception 'Senior Men - 1st XV is missing — it existed on 3 Sep 2026; stop and look';
  end if;
  -- ⚠️ THE RUN-ONCE GUARD. The live run on 3 Sep 2026 carried this line and the
  -- committed file did not; a second run would have doubled every fixture.
  if exists (select 1 from public.events e join public.teams t on t.id = e.team_id where t.is_senior) then
    raise exception 'senior events already exist — this seed runs once';
  end if;

  select id into men2 from public.teams where club_id = club and name = 'Senior Men - 2nd XV';
  if men2 is null then
    insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
    values (club, 'Senior Men - 2nd XV',
            (select coalesce(max(sort_order), 0) + 1 from public.teams where club_id = club),
            true, true, true)
    returning id into men2;
  end if;

  select id into men3 from public.teams where club_id = club and name = 'Senior Men - 3rd XV';
  if men3 is null then
    insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
    values (club, 'Senior Men - 3rd XV',
            (select coalesce(max(sort_order), 0) + 1 from public.teams where club_id = club),
            true, true, true)
    returning id into men3;
  end if;

  select id into women from public.teams where club_id = club and name = 'Senior Women';
  if women is null then
    insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
    values (club, 'Senior Women',
            (select coalesce(max(sort_order), 0) + 1 from public.teams where club_id = club),
            true, true, true)
    returning id into women;
  end if;

  -- ── League sides ────────────────────────────────────────────────────────
  -- The grid names every one of our sides "ADH"; the division tells them apart.
  select id into lt_wap from public.league_teams where team_id = men1 and division = 'WAP';
  if lt_wap is null then
    insert into public.league_teams (club_id, team_id, rcm_name, division, is_active, sort_order)
    values (club, men1, 'ADH', 'WAP', true, 0) returning id into lt_wap;
  end if;
  select id into lt_d1 from public.league_teams where team_id = men2 and division = 'D1';
  if lt_d1 is null then
    insert into public.league_teams (club_id, team_id, rcm_name, division, is_active, sort_order)
    values (club, men2, 'ADH', 'D1', true, 0) returning id into lt_d1;
  end if;
  select id into lt_d2 from public.league_teams where team_id = men3 and division = 'D2';
  if lt_d2 is null then
    insert into public.league_teams (club_id, team_id, rcm_name, division, is_active, sort_order)
    values (club, men3, 'ADH', 'D2', true, 0) returning id into lt_d2;
  end if;
  select id into lt_wxv from public.league_teams where team_id = women and division = 'WXV';
  if lt_wxv is null then
    insert into public.league_teams (club_id, team_id, rcm_name, division, is_active, sort_order)
    values (club, women, 'ADH', 'WXV', true, 0) returning id into lt_wxv;
  end if;

  -- ── Fixtures — one statement ────────────────────────────────────────────
  -- starts_at is midnight club time on the day, the convention the form's
  -- Time TBD writer uses (EventForm: "THE MIDNIGHT IS A CONVENTION OF THIS
  -- WRITER, NOT A SIGNAL"); time_tbd carries the meaning. No ends_at, per
  -- events_no_end_when_time_tbd.
  with rows (team_id, league_team_id, day, opponent, home, round, tier, competition_type, competition, format, title, notes) as (
    values
    -- Senior Men 1st XV — West Asia Premiership. Round 1 and Round 10 are byes.
    (men1, lt_wap, date '2026-10-10', 'Tusskers',           true,  2,  'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2026-10-17', 'Shaheen',            true,  3,  'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2026-10-23', 'Jebel Ali Dragons',  false, 4,  'WAP', 'league', null, 15, null, 'Friday night game'),
    (men1, lt_wap, date '2026-10-31', 'Dubai Sharks',       false, 5,  'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2026-11-14', 'Doha',               false, 6,  'WAP', 'league', null, 15, null, 'Reversed from the RCM grid — away'),
    (men1, lt_wap, date '2027-01-16', 'Dubai Hurricanes',   false, 7,  'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-01-23', 'Dubai Exiles',       true,  8,  'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-01-30', 'Bahrain',            true,  9,  'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-02-13', 'Tusskers',           false, 11, 'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-02-20', 'Shaheen',            false, 12, 'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-02-27', 'Jebel Ali Dragons',  true,  13, 'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-03-06', 'Dubai Sharks',       true,  14, 'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-03-20', 'Doha',               true,  15, 'WAP', 'league', null, 15, null, 'Reversed from the RCM grid — home'),
    (men1, lt_wap, date '2027-03-27', 'Dubai Hurricanes',   true,  16, 'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-04-03', 'Dubai Exiles',       false, 17, 'WAP', 'league', null, 15, null, null),
    (men1, lt_wap, date '2027-04-17', 'Bahrain',            false, 18, 'WAP', 'league', null, 15, null, null),
    -- Senior Men 2nd XV — Division 1. Round 1 is a bye.
    (men2, lt_d1,  date '2026-10-10', 'Tusskers',           true,  2,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2026-10-17', 'Shaheen',            true,  3,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2026-11-07', 'Jebel Ali Dragons',  false, 4,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-01-16', 'Dubai Hurricanes',   false, 5,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-01-23', 'Dubai Tigers',       true,  6,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-02-06', 'Al Ain Amblers',     false, 7,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-02-20', 'Dubai Sharks',       false, 8,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-03-06', 'Dubai Exiles',       true,  9,  'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-03-20', 'Barrelhouse',        true,  10, 'D1',  'league', null, 15, null, null),
    (men2, lt_d1,  date '2027-04-03', 'Bahrain',            false, 11, 'D1',  'league', null, 15, null, null),
    -- Senior Men 3rd XV — Division 2. Round 1 is a bye.
    (men3, lt_d2,  date '2026-10-10', 'Dubai Tigers',       true,  2,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2026-10-31', 'Jebel Ali Dragons',  false, 3,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2026-11-14', 'Dubai Sharks',       false, 4,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2027-01-16', 'Dubai Tuskers',      false, 5,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2027-01-30', 'Dubai Knights',      true,  6,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2027-02-13', 'Dubai Hurricanes',   false, 7,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2027-02-27', 'Barrelhouse',        true,  8,  'D2',  'league', null, 15, null, null),
    (men3, lt_d2,  date '2027-03-27', 'Al Ain Amblers',     true,  9,  'D2',  'league', null, 15, null, null),
    -- Senior Women — 7s league, one container per round day. No Round 4 on the poster.
    (women, null,  date '2026-10-03', null, null, null, null, 'tournament', 'W7s Round 1',   7, null, null),
    (women, null,  date '2026-10-31', null, null, null, null, 'tournament', 'W7s Round 2',   7, null, null),
    (women, null,  date '2026-11-13', null, null, null, null, 'tournament', 'W7s Round 3',   7, null, null),
    (women, null,  date '2026-11-27', null, null, null, null, 'tournament', 'Dubai 7s — Day 1', 7, null, 'Dubai 7s weekend, 27–29 Nov'),
    (women, null,  date '2026-11-28', null, null, null, null, 'tournament', 'Dubai 7s — Day 2', 7, null, 'Dubai 7s weekend, 27–29 Nov'),
    (women, null,  date '2026-11-29', null, null, null, null, 'tournament', 'Dubai 7s — Day 3', 7, null, 'Dubai 7s weekend, 27–29 Nov'),
    (women, null,  date '2027-01-31', null, null, null, null, 'tournament', 'W7s Round 5',   7, null, null),
    (women, null,  date '2027-02-13', null, null, null, null, 'tournament', 'W7s Round 6',   7, null, null),
    (women, null,  date '2027-02-27', null, null, null, null, 'tournament', 'W7s Final',     7, null, null),
    -- Senior Women — XVs league. Opponent and home/away not yet published: home null is "asked, not answered".
    (women, lt_wxv, date '2027-03-20', null, null, 1, 'WXV', 'league', null, 15, null, null),
    (women, lt_wxv, date '2027-03-27', null, null, 2, 'WXV', 'league', null, 15, null, null),
    (women, lt_wxv, date '2027-04-17', null, null, 3, 'WXV', 'league', null, 15, null, 'Round 3 date TBC — 16 or 17 Apr'),
    (women, lt_wxv, date '2027-04-30', null, null, null, 'WXV', 'league', null, 15, 'WXVs Final', null)
  )
  insert into public.events
    (club_id, team_id, type, starts_at, ends_at, time_tbd, all_day,
     opponent, home, round, tier, league_team_id, league_team_tbd,
     competition_type, competition, format, title, notes)
  select club, team_id, 'match',
         (day::timestamp) at time zone 'Asia/Dubai', null, true, false,
         opponent, home, round, tier, league_team_id, false,
         competition_type, competition, format, title, notes
    from rows;
  get diagnostics made = row_count;

  raise notice 'senior fixtures 2026-27: % events inserted; squads % % % %; sides % % % %',
    made, men1, men2, men3, women, lt_wap, lt_d1, lt_d2, lt_wxv;
end $$;
