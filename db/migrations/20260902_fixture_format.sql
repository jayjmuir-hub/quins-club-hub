-- db/migrations/20260902_fixture_format.sql
-- ══════════════════════════════════════════════════════════════════════════
--  Fixture format — 7s, 10s, 12s or 15s, on the FIXTURE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 2 Sep 2026: "all the age groups that play league play 15's, but
-- sometimes tournaments are 10, 12, or 15 or even 7's." The RCM/UAERF
-- 2025-26 law variations confirm it and add the fact the app gets wrong
-- today: U18 Boys and Girls play 10s, 12s or 15s at tournaments with a
-- squad max of 15, 18 or 22 — and the match sheet has 22 fixed slots.
-- claude/plans/2026-09-02-fixture-format.md.
--
-- ⚠️ ON events, NOT teams. A squad plays 15s on Friday and a 7s tournament
-- the next weekend; a format on the squad would be wrong for every
-- tournament. teams.default_format below is only what a NEW tournament or
-- friendly pre-selects.
--
-- ⚠️ NULLABLE, AND NULL MEANS "NOT STATED", WHICH THE APP READS AS 15. Every
-- fixture that exists today was a 15s fixture as far as the sheet knew.
-- Backfilling 15 would record an answer nobody gave; leaving null keeps each
-- of them exactly as it was. Same ruling as competition_type: the migration
-- writes nothing into existing rows.
--
-- ⚠️ A LEAGUE MATCH IS ALWAYS 15, AND THE DATABASE SAYS SO. The form does
-- not ask; this CHECK is what stops a hand-rolled REST call filing a 7s
-- league game. Null is allowed on a league row (it reads as 15).
--
-- ⚠️ MINIS ARE NOT SPECIAL-CASED HERE. U10 and below have their own formats
-- and no match sheet (src/lib/minis.js); the app simply never OFFERS the
-- control on a minis fixture. A constraint on age would have to parse
-- teams.name, which this schema refuses to do anywhere access or data shape
-- is decided.

alter table public.events
  add column if not exists format smallint;

comment on column public.events.format is
  'Players a side: 7, 10, 12 or 15. NULL means not stated and is read as 15 '
  'everywhere. A league match is always 15 (events_league_is_fifteen). '
  'Drives match-sheet slots, replacements and squad max via '
  'src/lib/fixtureFormat.js. claude/plans/2026-09-02-fixture-format.md.';

alter table public.events
  drop constraint if exists events_format_check;
alter table public.events
  add constraint events_format_check
  check (format is null or format in (7, 10, 12, 15));

alter table public.events
  drop constraint if exists events_league_is_fifteen;
alter table public.events
  add constraint events_league_is_fifteen
  check (competition_type is distinct from 'league' or format is null or format = 15);

alter table public.teams
  add column if not exists default_format smallint;

comment on column public.teams.default_format is
  'What a NEW tournament or friendly for this squad pre-selects: 7, 10, 12 '
  'or 15. NULL means 15. Set by an admin on the Club tab. Never read for a '
  'league match, which is always 15.';

alter table public.teams
  drop constraint if exists teams_default_format_check;
alter table public.teams
  add constraint teams_default_format_check
  check (default_format is null or default_format in (7, 10, 12, 15));

-- ── GUARD: the constraints exist, or abort ────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_league_is_fifteen') then
    raise exception 'ABORTING: events_league_is_fifteen was not created.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_default_format_check') then
    raise exception 'ABORTING: teams_default_format_check was not created.';
  end if;
  raise notice 'guard passed: fixture format columns and constraints in place';
end $$;
