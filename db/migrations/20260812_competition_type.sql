-- A match is a LEAGUE fixture or a TOURNAMENT fixture, and the app should ask
-- which rather than making somebody type it.
--
-- Jay, 12 Aug 2026: "there should also be a way to select in competition either
-- league or tournament, for league it should then give the option for R1-8, for
-- tournament it should give the options of ADHJRT, Dubai Youth Festival, Al Ain
-- Tournament, Small Blacks Tournament and then the possibility to customize the
-- tournament name".
--
-- ⚠️ A COLUMN RATHER THAN A DERIVED ANSWER, and the alternative was genuinely
-- tempting. "A fixture is a league match when `round` is set" needs no
-- migration at all — and it is wrong, because a league fixture whose round
-- nobody has entered yet would read as a friendly. The type is a fact somebody
-- states; the round is a detail they may not know yet. Deriving one from the
-- other makes an unfilled field indistinguishable from a different answer, and
-- that is the same shape as the null-league-team rule this feature already
-- turns on.
--
-- ⚠️ NULLABLE, AND NULL IS A REAL ANSWER: a FRIENDLY. It is neither a league
-- fixture nor a tournament one, and it is a common case. Nothing may read null
-- as "assume league" — the same rule `league_team_id` carries.
--
-- ⚠️ NO DEFAULT AND NO BACKFILL. Every existing row keeps `competition` (free
-- text, as it has been since v1) and gets a null type. The form reads that
-- combination as "a tournament whose name is that text", which preserves what
-- somebody typed and lets them correct it, rather than discarding it or
-- guessing a type into the database on their behalf. ⚠️ That read is a UI
-- convenience and is deliberately NOT written back until the row is next saved:
-- a migration that guessed would leave no way to tell a guess from an answer.

alter table public.events
  add column if not exists competition_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname  = 'events_competition_type_check'
  ) then
    alter table public.events
      add constraint events_competition_type_check
      check (competition_type in ('league', 'tournament'));
  end if;
end $$;

comment on column public.events.competition_type is
  'league | tournament. NULL means neither - a friendly - and is a real answer, '
  'never "assume league". `round` belongs to league; `competition` holds the '
  'tournament name. Deliberately NOT derived from `round`: a league fixture '
  'whose round is not yet known would otherwise read as a friendly.';

comment on column public.events.competition is
  'The TOURNAMENT name when competition_type = tournament. Free text on purpose '
  'so a competition the club has never entered before does not need a migration '
  '- the app offers the four regulars and a "Something else" box, the same '
  'shape the pitch picker uses. Rows predating competition_type may hold any '
  'string with a null type; those are read as a tournament name.';
