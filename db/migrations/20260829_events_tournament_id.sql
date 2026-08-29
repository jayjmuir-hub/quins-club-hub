-- A TOURNAMENT is a container: one events row that a squad turns up to for the
-- day, with the individual GAMES played recorded as their own events rows
-- underneath it. Jay, 29 Aug 2026: a tournament should be a first-class thing
-- you add, set up on its own, "and per game everything" — opponent, kick-off,
-- stage, score, its own team sheet.
--
-- See claude/plans/2026-08-29-tournaments-as-containers.md for the whole design.
-- This migration is phase 1: the columns only. Nothing user-visible ships until
-- the app that writes and reads them does.
--
-- ⚠️ THREE COLUMNS, ALL NULLABLE, NO DEFAULT, NO BACKFILL — so every one of the
-- rows already in this table keeps its exact meaning and reads as it did
-- yesterday. `tournament_id IS NULL` is the load-bearing fact: it means "a
-- top-level calendar entry", which every existing row is.
--
--   tournament_id  On a GAME, the id of its container tournament. NULL on
--                  everything else, including the container itself. This is the
--                  parent link and the filter the read paths hang off.
--   placing        On a CONTAINER, the optional overall result of the day —
--                  "Winners", "Runners-up", "Pool stage". Free text so a format
--                  nobody has entered before needs no migration, the shape
--                  `competition` already uses. NULL on a game.
--   stage          On a GAME, the optional "Pool A" / "Semi-final" label. Free
--                  text for the same reason. NULL on a container.
--
-- ⚠️ WHY A NEW COLUMN AND NOT group_id. group_id is already spoken for: since
-- 5 Aug 2026 it ties ONE session fanned out across several age groups (the
-- multi-squad "Also add for"), and src/data/pitches.js findPitchClashes and the
-- availability functions both read a shared group_id as "the same session, not a
-- clash". A tournament's games are the opposite relationship — many fixtures,
-- one squad, one parent — so reusing group_id would make the two
-- indistinguishable and corrupt clash detection. series_id is likewise taken
-- (repeating sessions across dates). The events block's own rule — group_id and
-- series_id are never both set on one row — extends here: a tournament offers
-- neither Repeats nor "Also add for", so tournament_id is exclusive of both by
-- construction.
--
-- ⚠️ ON DELETE CASCADE, ON PURPOSE. Deleting a tournament deletes its games,
-- and each game's match_sheets row already cascades from events
-- (match_sheets_event_id_fkey). So the whole subtree goes cleanly in one
-- statement. The COST of that — a tournament delete is not recoverable — is
-- carried by the UI, which must confirm loudly and name how many games will go,
-- the same two-step inline confirm the "delete this and every later session"
-- series path uses. The DATABASE cascades; the SAFETY is the confirm.
--
-- ⚠️ SELF-REFERENCING FK. tournament_id references events(id) — a game points at
-- another events row. Postgres allows this; the ON DELETE CASCADE is evaluated
-- per row, so deleting a container finds its children by this FK.

-- ⚠️ `placing` IS A RESERVED WORD in Postgres, so it MUST be quoted in raw SQL
-- (this migration, and db/tests/tournaments.sql). The app never trips on it:
-- supabase-js goes through PostgREST, which quotes every identifier. Separate
-- ALTERs rather than one multi-column statement — the reserved word breaks the
-- comma-separated form.
alter table public.events add column if not exists tournament_id uuid;
alter table public.events add column if not exists "placing"    text;
alter table public.events add column if not exists stage        text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname  = 'events_tournament_id_fkey'
  ) then
    alter table public.events
      add constraint events_tournament_id_fkey
      foreign key (tournament_id) references public.events(id) on delete cascade;
  end if;
end $$;

-- Partial index, matching events_group_id_idx / events_series_id_idx: only the
-- game rows are indexed, and the hot read is "the games of THIS tournament".
create index if not exists events_tournament_id_idx
  on public.events using btree (tournament_id)
  where (tournament_id is not null);

comment on column public.events.tournament_id is
  'On a GAME, the id of the tournament (an events row, competition_type = '
  'tournament, tournament_id null) it was played in. NULL on every top-level '
  'calendar entry, including the container itself. `tournament_id IS NULL` is '
  'the filter that keeps games out of the schedule and calendar feed. '
  'Exclusive of group_id and series_id, which a tournament never sets.';

comment on column public.events."placing" is
  'RESERVED WORD - quote in raw SQL. On a tournament CONTAINER, the optional '
  'overall result of the day - Winners, Runners-up, Pool stage. Free text, no '
  'CHECK, the shape competition uses. NULL on a game and on non-tournament '
  'events. NOT derived from the games'' scores: you can win every pool game and '
  'lose the final. Reached from the app through PostgREST, which quotes it.';

comment on column public.events.stage is
  'On a tournament GAME, the optional stage label - "Pool A", "Semi-final". '
  'Free text, no CHECK. NULL on a container and on ordinary fixtures.';

-- ── Guard: prove the change is actually there, not silently a no-op ──────────
-- (CLAUDE.md rule 6 - a migration asserts its own result.)
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'events'
         and column_name in ('tournament_id', 'placing', 'stage')) <> 3 then
    raise exception 'FAILED: events is missing one of tournament_id / placing / stage';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'events_tournament_id_fkey'
       and confdeltype = 'c'  -- 'c' = ON DELETE CASCADE
  ) then
    raise exception 'FAILED: events_tournament_id_fkey missing or not ON DELETE CASCADE';
  end if;
  raise notice 'guard passed: tournament_id (cascade) + placing + stage present';
end $$;
