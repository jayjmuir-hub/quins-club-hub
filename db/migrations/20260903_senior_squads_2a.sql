-- db/migrations/20260903_senior_squads_2a.sql
-- ══════════════════════════════════════════════════════════════════════════
--  Senior squads 2a — jersey numbers per squad, a player in several squads
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-02-senior-squads.md, Part 2. Jay, 2 Sep 2026:
-- "they have jersey numbers ... juniors do not", and option C — full
-- membership in every squad a player is in.
--
-- ⚠️ uses_jersey_numbers IS A COLUMN, NEVER DERIVED FROM is_senior OR THE
-- NAME. A social or touch side is senior without numbers. Same rule as
-- is_senior / self_registration_allowed / requires_contact: a rename must
-- not change behaviour.
--
-- ⚠️ THE AUGUST "NO JERSEY NUMBERS" RULING IS NARROWED, NOT REVERSED.
-- players.jersey_num has existed unused since Task 12; every youth squad
-- keeps uses_jersey_numbers = false and renders exactly as today. RESTORE.md
-- carries the tombstone.
--
-- ⚠️ UNIQUE PER SQUAD, 1–99. Two squads may both have a 9. The partial index
-- ignores nulls so a squad with no numbers at all is unaffected.
--
-- ⚠️ can_see_player WIDENS READ ONLY. "player read" was can_see_team(team_id)
-- OR is_own_player(id) — a coach of squad B could not see a player whose
-- HOME is squad A even with a B membership. The helper adds "or any active
-- membership in a squad the caller can see". Edit policies keyed on the
-- home squad (positions, player_private) are deliberately untouched in 2a.
--
-- ⚠️ create_team EXISTS BECAUSE THE APP HAS NEVER CREATED A SQUAD: every
-- squad to date was inserted by migration. "team manage" already lets an
-- admin INSERT, but a SECURITY DEFINER RPC keeps the four flags together and
-- refuses a non-admin with 42501 rather than a silent zero-row insert.

alter table public.teams
  add column if not exists uses_jersey_numbers boolean not null default false;
comment on column public.teams.uses_jersey_numbers is
  'Season jersey numbers on the roster (players.jersey_num). A column, never derived. '
  'False for every youth squad; set by an admin on the Club tab. '
  'claude/plans/2026-09-02-senior-squads.md.';

alter table public.players drop constraint if exists players_jersey_num_check;
alter table public.players add constraint players_jersey_num_check
  check (jersey_num is null or (jersey_num between 1 and 99));

create unique index if not exists players_team_jersey_unique
  on public.players (team_id, jersey_num) where jersey_num is not null;

create or replace function private.can_see_player(_player uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select exists (
    select 1 from public.players p
     where p.id = _player
       and private.can_see_team(p.team_id))
  or exists (
    select 1 from public.memberships m
     where m.player_id = _player
       and m.status = 'active'
       and private.can_see_team(m.team_id));
$$;
revoke all on function private.can_see_player(uuid) from public;
grant execute on function private.can_see_player(uuid) to authenticated;

drop policy if exists "player read" on public.players;
create policy "player read" on public.players
  for select using (private.can_see_player(id) or private.is_own_player(id));

create or replace function public.create_team(
  p_name text, p_is_senior boolean default false,
  p_uses_jersey_numbers boolean default false, p_self_registration_allowed boolean default false)
 returns public.teams
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare club uuid; made public.teams;
begin
  select m.club_id into club from public.memberships m
   where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active' limit 1;
  if club is null then
    raise exception 'Only a club admin can add a squad.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A squad needs a name.' using errcode = '22023';
  end if;
  insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
  values (club, trim(p_name),
          (select coalesce(max(sort_order), 0) + 1 from public.teams where club_id = club),
          coalesce(p_is_senior, false), coalesce(p_uses_jersey_numbers, false),
          coalesce(p_self_registration_allowed, false))
  returning * into made;
  return made;
end;
$$;
revoke all on function public.create_team(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.create_team(text, boolean, boolean, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'player read' and tablename = 'players'
                 and qual like '%can_see_player%') then
    raise exception 'ABORTING: "player read" does not use can_see_player.';
  end if;
  raise notice 'guard passed: senior squads 2a in place';
end $$;
