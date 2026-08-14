-- The coach also says how big the MATCHDAY SQUAD is.
-- Jay, 14 Aug 2026: "need an option below players per side to select total
-- number in squad".
--
-- ⚠️ TOTAL, NOT BENCH SIZE. `players_per_side` is how many are on the pitch;
-- this is starters PLUS replacements. The two are set independently rather than
-- one derived from the other, because a coach naming 22 for a 15-a-side match
-- and a coach naming 10 for a 7s tournament are both saying something the app
-- cannot work out on its own.
--
-- ⚠️ A GUIDE, NOT A GATE — the same rule players_per_side carries and for the
-- same reason. NOTHING ties this to the number of rows in lineup_players, and
-- the screen must never refuse a pick because of it. Coaches over-pick and cut.
-- The CHECK is a sanity bound on the NUMBER, not a limit on the lineup.
alter table public.lineups
  add column if not exists squad_size smallint;

alter table public.lineups
  drop constraint if exists lineups_squad_size_check;

alter table public.lineups
  add constraint lineups_squad_size_check
  check (squad_size is null or (squad_size between 1 and 40));

comment on column public.lineups.squad_size is
  'How many players are in the MATCHDAY SQUAD in total - starters plus '
  'replacements - as chosen by the coach. Like players_per_side it is a GUIDE '
  'the screen counts against, NOT a limit: nothing ties it to the number of rows '
  'in lineup_players, and it must never refuse a pick. Null means not set.';

-- ⚠️ NO GRANT NEEDED. Column privileges were never used on this table — the
-- migration that created it granted at TABLE level — so a new column is covered
-- by the existing grant. Worth stating, because `announcements` DOES use
-- column-level UPDATE grants and a new column there would NOT be.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='lineups' and column_name='squad_size'
  ) then
    raise exception 'FAILED: lineups.squad_size was not created';
  end if;
  raise notice 'guard passed: lineups.squad_size exists';
end $$;
