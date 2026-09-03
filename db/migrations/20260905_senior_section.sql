-- ══════════════════════════════════════════════════════════════════════════
--  The senior section — a section on each squad, and section-wide reading
--  for the adults in it
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 3 Sep 2026, on the senior teams: "there is no overall view … you can't
-- see everyone and everything, you have to switch between them." And on
-- visibility: seniors are adults, so within a section a player sees every
-- squad the way he sees his own; across men and women, fixtures and results
-- only; chat, notices and documents stay per squad.
-- claude/plans/2026-09-03-senior-section.md.
--
-- ⚠️ A COLUMN, NEVER THE NAME. `teams.section` is set by an admin on the Club
-- tab. Nothing here parses "Men" or "Women" out of a squad's name — the same
-- rule as is_senior and uses_jersey_numbers, for the same reason: a name is
-- a label, and a label is not a permission.
--
-- ⚠️ THREE NARROW ARMS, NOT A WIDER can_see_team. can_see_team is read by
-- twenty-nine policies including chat, notices and documents, and widening it
-- would drop a 2nd XV player into the 1st XV's chat. So the section reach is
-- its own helper, added to exactly three read policies:
--   player read    same section  → the roster (names, numbers, positions)
--   avail read     same section  → who is in and out for the weekend
--   event read     ANY senior section → fixtures and results, men and women
-- Everything else is untouched.
--
-- ⚠️ THE UNDER-18 LINE. A 17-year-old called up to a senior squad is still a
-- child. Nothing about that changes here BECAUSE nothing here touches
-- player_private (birthday, phone, medical), player_photos, messaging or the
-- DM review — all of which key on the PERSON (private.is_minor_profile reads
-- the birthday) or on staff/own-player, never on the squad. A section-mate
-- gains the child's NAME on the roster, which every squad-mate already had,
-- and nothing else. db/tests/senior-section.sql proves it with a minor in a
-- senior squad: the section-mate reads the players row and is refused the
-- private row and the photo.
--
-- ⚠️ CROSS-SECTION ROSTERS ARE OFF AND THERE IS NO SWITCH YET. Jay's default:
-- a women's squad decides whether men read its numbers and attendance, not
-- the app. A club setting can come when a section asks for it.

alter table public.teams
  add column if not exists section text;

alter table public.teams
  drop constraint if exists teams_section_check;
alter table public.teams
  add constraint teams_section_check
  check (section is null or section in ('senior_men', 'senior_women'));

comment on column public.teams.section is
  'The senior section this squad belongs to (senior_men | senior_women), set by an admin on the Club tab. Null for every junior squad. Drives section-wide READ of rosters and availability for active members of the same section, and of fixtures across both sections. Never derived from the name.';

-- The caller holds an active membership in a squad of the SAME section as _team.
create or replace function private.same_section_member(_team uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.teams t
      join public.teams mine on mine.section = t.section
      join public.memberships m on m.team_id = mine.id
     where t.id = _team
       and t.section is not null
       and m.profile_id = auth.uid()
       and m.status = 'active'
  );
$$;
revoke execute on function private.same_section_member(uuid) from public;
grant execute on function private.same_section_member(uuid) to authenticated;

-- _team is in a senior section and the caller holds an active membership in
-- ANY senior section — fixtures and results across men and women.
create or replace function private.senior_section_fixture_reach(_team uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (select 1 from public.teams t where t.id = _team and t.section is not null)
     and exists (
       select 1
         from public.memberships m
         join public.teams mine on mine.id = m.team_id
        where m.profile_id = auth.uid()
          and m.status = 'active'
          and mine.section is not null
     );
$$;
revoke execute on function private.senior_section_fixture_reach(uuid) from public;
grant execute on function private.senior_section_fixture_reach(uuid) to authenticated;

-- ── The three arms ─────────────────────────────────────────────────────────
drop policy if exists "event read" on public.events;
create policy "event read" on public.events
  as permissive for select to public
  using (private.is_attached_to_team(team_id) or private.senior_section_fixture_reach(team_id));

drop policy if exists "player read" on public.players;
create policy "player read" on public.players
  as permissive for select to public
  using (private.can_see_player(id) or private.is_own_player(id) or private.same_section_member(team_id));

drop policy if exists "avail read" on public.availability;
create policy "avail read" on public.availability
  as permissive for select to public
  using (
    private.can_see_team((select e.team_id from public.events e where e.id = availability.event_id))
    or private.can_edit_team((select e.team_id from public.events e where e.id = availability.event_id))
    or private.is_own_player(player_id)
    or private.same_section_member((select e.team_id from public.events e where e.id = availability.event_id))
  );

-- ── Assert it landed ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'section') then
    raise exception 'teams.section was not added';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'players' and policyname = 'player read' and qual like '%same_section_member%') then
    raise exception 'player read did not gain the section arm';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'event read' and qual like '%senior_section_fixture_reach%') then
    raise exception 'event read did not gain the section arm';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'availability' and policyname = 'avail read' and qual like '%same_section_member%') then
    raise exception 'avail read did not gain the section arm';
  end if;
end $$;
