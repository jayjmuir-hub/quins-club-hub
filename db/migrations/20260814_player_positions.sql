-- Every position a player can cover.
-- Jay, 14 Aug 2026: "the option to add multiple positions in case there are
-- players who play different positions sometimes".
--
-- ⚠️ players.position REMAINS, AND IS THE PRIMARY. It is NOT replaced, and that
-- is a deliberate scope decision rather than laziness: SIX things read it — the
-- roster meta line AND its inline editor in RosterTable, YourPlayers,
-- PlayerDetail, the bulk importer, and the forwards/backs fallback in
-- Roster.positionGroup. Rewriting all six to read a joined table would be a large
-- change with no user-visible benefit and a lot of surface to get wrong. The form
-- keeps `players.position` in step with the FIRST row here, so every existing
-- reader keeps working and this table is the FULL SET.
--
-- ⚠️ A TABLE, NOT MORE COLUMNS. `position_2` caps it at two, and a
-- comma-separated string is unsearchable and unjoinable.
--
-- ⚠️ NO CHECK ON THE VALUE. The offerable list is src/lib/positions.js, which the
-- club changes without a migration; a CHECK here would be a second copy that
-- drifts the first time somebody adds one. Same reasoning as
-- lineup_players.position.

create table if not exists public.player_positions (
  id         uuid     not null default gen_random_uuid(),
  player_id  uuid     not null,
  position   text     not null,
  sort_order smallint not null default 0,
  constraint player_positions_pkey primary key (id),
  constraint player_positions_player_id_fkey foreign key (player_id) references public.players(id) on delete cascade,
  -- Listing a position twice for one player is always a mistake.
  constraint player_positions_player_position_key unique (player_id, position)
);

comment on table public.player_positions is
  'Every position a player can cover, for the players who play more than one. players.position REMAINS THE PRIMARY and is not replaced: six readers use it (the roster meta line and its inline editor, YourPlayers, PlayerDetail, the bulk importer, the forwards/backs fallback), and the form keeps it in step with the first row here. This table is the FULL SET. No CHECK on the value: the offerable list lives in src/lib/positions.js and a constraint here would be a second copy that drifts. NOT sensitive - same class as players.position which parents already read; the ability tier is player_grades and is not this.';

create index if not exists player_positions_player_idx on public.player_positions(player_id, sort_order);

alter table public.player_positions enable row level security;

-- ⚠️ READ IS WIDER THAN WRITE, MIRRORING `players` ITSELF, and the asymmetry is
-- the point. A parent reads their own child and their squad; only a coach writes.
-- ⚠️ DELIBERATELY NOT the coach-only shape `player_grades` uses in the migration
-- alongside this one — a position is not a judgement about a child, it is the
-- same information the roster already shows everybody. Do not "tidy" the two
-- into one shape.
drop policy if exists "player position read" on public.player_positions;
create policy "player position read" on public.player_positions
  for select
  using (
    exists (
      select 1 from public.players p
       where p.id = player_positions.player_id
         and (private.can_see_team(p.team_id) or private.is_own_player(p.id))
    )
  );

drop policy if exists "player position write" on public.player_positions;
create policy "player position write" on public.player_positions
  for all
  using (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_positions.player_id))
  )
  with check (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_positions.player_id))
  );

-- See the note in the tiers migration: Supabase's DEFAULT PRIVILEGES still grant
-- anon on a NEW table depending on which role creates it.
-- Fault-injected after applying: an authenticated caller with no membership is
-- refused 42501 on a write, using a real player id captured beforehand — an
-- earlier attempt selected the id inside the same statement, read zero rows as
-- `authenticated`, inserted nothing and reported itself as a pass.
revoke all on public.player_positions from anon;
grant select, insert, update, delete on public.player_positions to authenticated;

-- ⚠️ BACKFILLED SO THE TABLE IS NOT EMPTY ON DAY ONE. Without this, a screen
-- reading it would show "no positions" for every player who already has one, and
-- a coach would reasonably conclude the data had been lost. ON CONFLICT DO
-- NOTHING so re-running is safe.
insert into public.player_positions (player_id, position, sort_order)
select p.id, p.position, 0
from public.players p
where p.position is not null and btrim(p.position) <> ''
on conflict (player_id, position) do nothing;

do $$
declare backfilled int; expected int;
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='player_positions') then
    raise exception 'FAILED: player_positions missing';
  end if;
  if has_table_privilege('anon','public.player_positions','SELECT') then
    raise exception 'FAILED: anon can read player_positions';
  end if;
  select count(*) into backfilled from public.player_positions;
  select count(*) into expected from public.players where position is not null and btrim(position) <> '';
  -- ⚠️ Compares against the SOURCE COUNT rather than asserting "> 0": a backfill
  -- that copied one row of two would otherwise pass.
  if backfilled < expected then
    raise exception 'FAILED: backfill short - % rows for % players', backfilled, expected;
  end if;
  raise notice 'guard passed: % rows backfilled for % players', backfilled, expected;
end $$;
