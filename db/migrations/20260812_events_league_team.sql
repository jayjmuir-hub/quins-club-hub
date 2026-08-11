-- A fixture can say WHICH of the club's teams played it.
--
-- Jay, 11 Aug 2026: "on the fixtures too, need to show league division if its
-- league match, what round it is, and that league team name".
--
-- Depends on 20260812_league_teams.sql.
--
-- ⚠️ THE RULE THIS CREATES, WRITTEN DOWN BECAUSE IT CANNOT BE INFERRED FROM
-- THE SCHEMA: a fixture IS a league match when league_team_id IS NOT NULL.
-- Null means it is not one, and division and round must render as NOTHING.
-- Never read null as "assume league".
--
-- That is stated because this club has been bitten by exactly this shape once
-- already. src/lib/ageGroup.js returned null for an unparseable squad name,
-- allowsOwnContact read null as "a senior side: adults", and the app offered a
-- twelve-year-old girls' squad the child's own email and phone fields. The
-- lesson recorded then was THE NULL DEFAULT, not the regex.

alter table public.events
  add column if not exists league_team_id uuid references public.league_teams(id) on delete set null,
  add column if not exists round smallint;

-- ⚠️ ON DELETE SET NULL, NEVER CASCADE. Retiring or deleting a league team must
-- cost the fixture its LABEL, which is recoverable, and must never cost the
-- club the FIXTURE, which is not.
comment on column public.events.league_team_id is
  'Which of the club''s league teams played this fixture. NOT NULL means this IS '
  'a league match; null means it is not one, and division and round render as '
  'nothing. Never read null as "assume league".';

comment on column public.events.round is
  'League round number. Null unless league_team_id is set - a round number on a '
  'friendly is stale data, not a label.';

-- ── THE GUARD. Reads the columns back, inside the transaction. ──────────
-- ⚠️ A Postgres self-assignment has already reported success and changed
-- nothing in this schema once (6 Aug). Read it back.
do $$
declare
  n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'events'
     and column_name in ('league_team_id', 'round');
  if n <> 2 then
    raise exception 'ABORTING: expected both new columns on events, found %.', n;
  end if;
  raise notice 'guard passed: events.league_team_id and events.round exist';
end $$;
