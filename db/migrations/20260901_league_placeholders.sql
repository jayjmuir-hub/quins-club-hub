-- ══════════════════════════════════════════════════════════════════════════
--  League placeholders — a league round whose side and tier are not known yet
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 1 Sep 2026, putting the 2026–27 RCM juniors calendar onto squad
-- schedules: the league (U11+) publishes ROUNDS months before it publishes
-- fixtures. "Round 1, Saturday" is known; which of our sides plays, at what
-- tier, where, and against whom is not. Time TBD and Pitch TBD already exist;
-- this migration gives the same honesty to the league team and the tier.
-- (Home/away TBD needs no schema change — `home` is already a nullable
-- boolean, and a plain match could never hold null before, so null now means
-- "asked, not answered yet" for one. A tournament container also stores null
-- there, but a container never asked the question and no reader confuses the
-- two: they render through different screens and different branches.)
--
-- ⚠️ "NOT A LEAGUE MATCH" AND "TBD" ARE DIFFERENT ANSWERS AND MUST STAY
-- STORABLE AS DIFFERENT VALUES. `league_team_id` is a uuid foreign key, and
-- null already means "a friendly / not a league fixture" — the common case.
-- A sentinel cannot live in a uuid FK, and overloading null would make a
-- placeholder indistinguishable from a friendly on the next edit. Hence a
-- separate boolean rather than a magic value. Same ruling as
-- 20260814_competition_tbd_and_time_tbd.sql: "not decided yet" and "not
-- applicable" are different answers and both must be sayable.
--
-- ⚠️ THE TIER IS DIFFERENT: it is a text column, so 'TBD' CAN live in it —
-- the existing events_tier_check just has to admit it. Null keeps meaning
-- "no tier: a friendly or untiered", unchanged.
--
-- ⚠️ THE CHECK CONSTRAINT BELOW IS THE GUARANTEE that a fixture cannot claim
-- a league team and simultaneously claim not to know it. The form's single
-- select makes that unreachable through the UI, but the UI is not a boundary.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing league fixture either named its
-- team or genuinely is not a league match; guessing "league + no team must
-- mean TBD" is exactly the heuristic 20260814 refused for competition_type.
--
-- ⚠️ NO GRANT NEEDED. `events` is granted ALL at TABLE level, not
-- column-scoped, so a new column inherits (db/schema/grants.sql).

alter table public.events
  add column if not exists league_team_tbd boolean not null default false;

comment on column public.events.league_team_tbd is
  'A league fixture whose side (ADHQ1/ADHQ2/…) is not known yet. DISTINCT from league_team_id being null, which means "not a league match" — a friendly. Never both: see events_league_team_not_both.';

alter table public.events
  drop constraint if exists events_league_team_not_both;

alter table public.events
  add constraint events_league_team_not_both
  check (not (league_team_tbd and league_team_id is not null));

-- The tier gains 'TBD' as a fourth admissible value. Null stays "no tier".
alter table public.events
  drop constraint if exists events_tier_check;

alter table public.events
  add constraint events_tier_check
  check (tier is null or tier = any (array['A'::text, 'B'::text, 'C'::text, 'TBD'::text]));

-- ── Assert it landed, column AND both constraints ──────────────────────────
do $$
declare col record;
begin
  select data_type, is_nullable, column_default into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'league_team_tbd';

  if col is null
     or col.data_type <> 'boolean'
     or col.is_nullable <> 'NO'
     or col.column_default is distinct from 'false' then
    raise exception 'events.league_team_tbd did not land as specified: %', col;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_league_team_not_both'
  ) then
    raise exception 'events_league_team_not_both is missing — a fixture can claim a team and TBD at once';
  end if;

  -- The re-created tier check must actually admit 'TBD' and still refuse junk.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_tier_check'
      and pg_get_constraintdef(oid) like '%TBD%'
  ) then
    raise exception 'events_tier_check was not widened to admit TBD';
  end if;
end $$;
