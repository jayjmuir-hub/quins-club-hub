-- The admin split: an admin row reaches no squad by itself (Jay, 3 Sep 2026,
-- claude/plans/2026-09-03-admin-team-reach.md — all four rulings confirmed).
--
-- ⚠️ THREE HELPER BODIES, NOT 274 SITES. Every squad-scoped policy already
-- routes through private.can_edit_team, private.can_see_team or
-- private.is_attached_to_team, and each had the same admin arm:
--     m.role = 'admin' and m.club_id = <the team's club>
-- i.e. "any active admin in this club reaches every squad". That is what
-- left a Pitch-only admin — names-read-only on paper since 28 Aug — able to
-- open every roster, take any register, edit any lineup and read every
-- squad chat (claude/open-items.md item 13).
--
-- The admin arm now goes through ONE new helper, private.admin_team_reach,
-- which is DEFAULT-DENY: an admin reaches a squad only through a right on an
-- allowlist (or is_super). A wiring miss hides; it never leaks. The lists
-- are read straight off the 28 Aug matrix
-- (claude/specs/2026-08-28-admin-rights-access-matrix-and-threat-model.md §5.2):
--
--     edit        clubadmin, youth                       — rosters, lineups,
--                                                          match sheets, staff
--                                                          chat, contacts write…
--     see         clubadmin, youth, media, welfare,      — names, fixtures,
--                 pitches, training                        squad chat, availability
--     events      clubadmin, youth, media, pitches       — Social and Pitch edit
--                                                          events (matrix)
--     attendance  clubadmin, youth, training             — Training writes
--                                                          attendance (matrix ⁴)
--
-- `private.is_admin` is UNTOUCHED and still means "any active admin" for the
-- club-level spine (clubs, the teams table, invites, feedback, whole-club
-- notices and chat, pitches, social ideas) — none of it is children's data,
-- and Jay confirmed it stays (ruling 3).
--
-- ⚠️ WHAT CHANGES FOR REAL PEOPLE. Supers and clubadmin holders: nothing.
-- An admin holding only specialist rights loses squad reach the moment this
-- applies (ruling 4 — two such rows on 3 Sep). A coach/manager row is the
-- designed way back to a squad. Senior squads get the same rule (ruling 2).
--
-- Harness: db/tests/admin-team-reach.sql — a synthetic club with one persona
-- per right plus a ZERO-RIGHTS admin, both directions per surface, with the
-- pre-migration baseline printed first.

begin;

-- ── The one new helper ──────────────────────────────────────────────────────

create or replace function private.admin_team_reach(_team uuid, _mode text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role = 'admin'
       and m.club_id = (select club_id from teams where id = _team)
       and (m.is_super
            or m.admin_rights && case _mode
                 when 'edit'       then array['clubadmin','youth']
                 when 'see'        then array['clubadmin','youth','media','welfare','pitches','training']
                 when 'events'     then array['clubadmin','youth','media','pitches']
                 when 'attendance' then array['clubadmin','youth','training']
                 else array[]::text[]
               end));
$function$;

revoke all on function private.admin_team_reach(uuid, text) from public;
revoke execute on function private.admin_team_reach(uuid, text) from anon;
grant execute on function private.admin_team_reach(uuid, text) to authenticated;

comment on function private.admin_team_reach(uuid, text) is
  'Default-deny: does this ADMIN''s right (or is_super) reach this squad in this mode? '
  'Modes: edit | see | events | attendance. The squad-row arms live in the callers. '
  '20260904_admin_team_reach.';

-- ── The three rewrites: only the admin arm changes ──────────────────────────

create or replace function private.can_edit_team(_team uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.admin_team_reach(_team, 'edit')
      or exists (select 1 from memberships m
           where m.profile_id = auth.uid()
             and m.status = 'active'
             and m.role in ('coach','manager','medic')
             and m.team_id = _team);
$function$;

create or replace function private.can_see_team(_team uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.admin_team_reach(_team, 'see')
      or exists (select 1 from memberships m
           where m.profile_id = auth.uid()
             and m.status = 'active'
             and m.team_id = _team);
$function$;

-- Keeps status <> 'left' for SQUAD rows (a pending member sees the schedule —
-- RESTORE.md "the asymmetry that replaced it"); the admin arm has always
-- demanded active and still does, inside admin_team_reach.
create or replace function private.is_attached_to_team(_team uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.admin_team_reach(_team, 'see')
      or exists (select 1 from memberships m
           where m.profile_id = auth.uid()
             and m.status <> 'left'
             and m.team_id = _team);
$function$;

-- ── Two surfaces the matrix grants to rights that are NOT team editors ─────

-- events: Social and Pitch edit events. The club-wide arm (team_id null →
-- any admin) is unchanged: a whole-club social is club-level, not a squad.
drop policy "event edit" on public.events;
create policy "event edit" on public.events
  for all
  using (private.can_edit_team(team_id)
         or private.admin_team_reach(team_id, 'events')
         or (team_id is null and private.is_admin(club_id)))
  with check (private.can_edit_team(team_id)
         or private.admin_team_reach(team_id, 'events')
         or (team_id is null and private.is_admin(club_id)));

-- attendance: Training writes attendance (and therefore reads it — the read
-- policy is the write gate OR is_own_player, by design; db/tests/attendance.sql).
create or replace function private.can_take_register(_event uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.can_edit_team(e.team_id)
      or private.admin_team_reach(e.team_id, 'attendance')
    from events e where e.id = _event;
$function$;

revoke all on function private.can_take_register(uuid) from public;
revoke execute on function private.can_take_register(uuid) from anon;
grant execute on function private.can_take_register(uuid) to authenticated;

drop policy "attendance read" on public.attendance;
create policy "attendance read" on public.attendance
  for select using (private.can_take_register(event_id) or private.is_own_player(player_id));

drop policy "attendance write insert" on public.attendance;
create policy "attendance write insert" on public.attendance
  for insert with check (private.can_take_register(event_id));

drop policy "attendance write update" on public.attendance;
create policy "attendance write update" on public.attendance
  for update using (private.can_take_register(event_id))
  with check (private.can_take_register(event_id));

drop policy "attendance write delete" on public.attendance;
create policy "attendance write delete" on public.attendance
  for delete using (private.can_take_register(event_id));

commit;
