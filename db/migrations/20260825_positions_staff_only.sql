-- Positions become staff-only (Jay, 25 Aug 2026: "positions should only be
-- viewable and editable by staff").
--
-- ⚠️ THIS REVERSES THE 14 Aug RULING recorded on player_positions ("a position
-- is not a judgement about a child ... Do not tidy the two into one shape").
-- Jay reversed it explicitly on 25 Aug; both tables now share the player_grades
-- shape: can_edit_team on every arm, no wider read.
--
-- The mechanism, and why there are two tables:
-- RLS grants access to ROWS, not columns, and `players` is squad-readable —
-- so `players.position` and `players.unit` cannot be staff-only while they
-- live on that row. The data moves:
--   * positions  -> player_positions (already the FULL SET; now the ONLY set)
--   * unit       -> player_units (new; forward | back)
-- and the two players columns are NULLED here. They are dropped in a LATER
-- migration, after this app version has deployed — the deployed code still
-- writes them until then (destructive schema change: deploy first).
--
-- Sequencing: run this BEFORE deploying the app version that reads the new
-- table. Old code keeps working against the new schema (parents merely see
-- "Not set"); new code errors without player_units.

-- 1 ▸ player_units ----------------------------------------------------------

create table if not exists public.player_units (
  player_id uuid not null,
  unit      text not null,
  constraint player_units_pkey primary key (player_id),
  constraint player_units_player_id_fkey foreign key (player_id)
    references public.players(id) on delete cascade,
  -- Two values by design; NULL is expressed by having no row.
  constraint player_units_unit_check check (unit in ('forward', 'back'))
);

comment on table public.player_units is
  'Forward or back, per player - STAFF-ONLY, the player_grades shape. Moved off players.unit on 25 Aug 2026 when Jay made positions staff-only; RLS grants rows, not columns, so the squad-readable players row could not keep it. Authoritative over the specific position where they disagree (Jay, 14 Aug 2026): a back whose position says Flanker is a data error for a human, not something the app reconciles.';

alter table public.player_units enable row level security;

drop policy if exists "player unit manage" on public.player_units;
create policy "player unit manage" on public.player_units
  for all
  using (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_units.player_id))
  )
  with check (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_units.player_id))
  );

-- ⚠️ THE REVOKE IS LOAD-BEARING — Supabase's default privileges still grant
-- anon on a new table (measured in pg_default_acl, 14 Aug 2026).
revoke all on public.player_units from anon;
grant select, insert, update, delete on public.player_units to authenticated;

-- 2 ▸ player_positions tightens to the same shape ---------------------------

drop policy if exists "player position read" on public.player_positions;
drop policy if exists "player position write" on public.player_positions;
drop policy if exists "player position manage" on public.player_positions;
create policy "player position manage" on public.player_positions
  for all
  using (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_positions.player_id))
  )
  with check (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_positions.player_id))
  );

comment on table public.player_positions is
  'Every position a player can cover, first row (sort_order 0) is the PRIMARY. STAFF-ONLY since 25 Aug 2026 (Jay), reversing the 14 Aug wider-read ruling - players.position is nulled and later dropped, so this table is now the ONLY store. No CHECK on the value: the offerable list lives in src/lib/positions.js and a constraint here would be a second copy that drifts.';

-- 3 ▸ backfill from the players columns, then null them ---------------------

insert into public.player_units (player_id, unit)
  select id, unit from public.players
   where unit in ('forward', 'back')
on conflict (player_id) do nothing;

-- Only players with NO rows yet: for everyone else the form has kept the
-- first row in step with players.position since 14 Aug.
insert into public.player_positions (player_id, position, sort_order)
  select p.id, p.position, 0
    from public.players p
   where p.position is not null
     and btrim(p.position) <> ''
     and not exists (select 1 from public.player_positions pp where pp.player_id = p.id)
on conflict (player_id, position) do nothing;

update public.players set position = null where position is not null;
update public.players set unit = null where unit is not null;
