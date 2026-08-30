-- Club-wide events: an event with team_id NULL belongs to the WHOLE CLUB, not
-- one squad.
--
-- WHY. Every event so far has belonged to exactly one squad (team_id NOT NULL),
-- and "show it to several squads" is the fan-out — one row per squad, shared
-- group_id (2026-08-05-multi-squad-events-and-pitch.md). A recurring, whole-club
-- social (Jay, 30 Aug 2026: "Adult Tag, every Wed, open to everyone, all
-- season") does not fit that: fanning it out across 15 squads for a season is
-- hundreds of rows and one edit per squad per week. It is a SINGLE event that
-- everyone can see. So team_id becomes nullable, and NULL means "the whole
-- club". Because it is one event, it repeats as an ordinary series — no fan-out,
-- so none of the row-multiplication the fan-out+repeat guard exists to prevent.
--
-- ⚠️ ADMIN-CREATED, EVERYONE-VISIBLE, INFORMATIONAL. A club-wide event writes to
-- every member's calendar, so only an admin may create/edit one. It has no
-- squad roster, so it carries no player RSVP — the app hides the availability
-- section for it (see src/screens/EventDetail.jsx). Self-RSVP for club events is
-- a later, person-based feature, deliberately not built here.

-- ── 1. team_id becomes nullable ─────────────────────────────────────────────
-- A club-wide event has no squad. The column stays a FK to teams (a squad event
-- still points at a real squad); NULL is the new, distinct "whole club" value.
alter table public.events alter column team_id drop not null;

-- ── 2. private.is_member(_club) ─────────────────────────────────────────────
-- "Am I an active member of this club" — mirrors private.is_admin(_club) exactly
-- (20260818), without the role gate. Used only to let every active member READ a
-- club-wide event. SECURITY DEFINER + fixed search_path, like every private
-- helper; default PUBLIC execute is how is_admin is granted too, so RLS (run as
-- authenticated) can call it.
create or replace function private.is_member(_club uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and m.club_id = _club);
$function$;

-- ── 3. Widen the two events policies to admit a squad-less event ────────────
-- READ: an ordinary squad event is unchanged (is_attached_to_team); a club-wide
-- event (team_id NULL) is readable by any active member of its club.
-- EDIT: a squad event is unchanged (can_edit_team); a club-wide event is
-- editable by admins of its club ONLY — it reaches everyone's calendar.
-- ALTER POLICY (not drop+recreate) keeps the policy name and the rest intact.
alter policy "event read" on public.events
  using (
    private.is_attached_to_team(team_id)
    or (team_id is null and private.is_member(club_id))
  );

alter policy "event edit" on public.events
  using (
    private.can_edit_team(team_id)
    or (team_id is null and private.is_admin(club_id))
  )
  with check (
    private.can_edit_team(team_id)
    or (team_id is null and private.is_admin(club_id))
  );

-- ── 4. The calendar feed emits club-wide events too ─────────────────────────
-- The feed's read JOINed teams on team_id, which DROPS a squad-less event, and
-- it decided membership from the team's club_id, which is null for one. So:
--   * LEFT JOIN teams — a club-wide event survives with a null team_name;
--   * key the admin/club test off e.club_id (always set; equals t.club_id for a
--     squad event) rather than t.club_id;
--   * add the club-wide case — any member of the event's club gets it.
-- The in-app read (src/data/events.js listEvents) carries the identical widening
-- (team_id in (…) OR team_id is null); the two must agree, the same rule the
-- tournament_id and competition_type filters already follow.
--
-- ⚠️ CREATE OR REPLACE, RETURNS TABLE UNCHANGED, so grants are preserved (the
-- {anon,authenticated,service_role} + revoke-from-public dance in
-- db/schema/functions.sql stays put) — no grant is repeated here.
create or replace function public.calendar_events_for_token(_token uuid)
returns table (
  id uuid,
  type text,
  title text,
  opponent text,
  home boolean,
  venue text,
  pitch text,
  competition text,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  team_name text,
  league_team_name text,
  league_division text,
  round smallint,
  time_tbd boolean,
  competition_type text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd, e.competition_type
  from public.events e
  left join public.teams t on t.id = e.team_id
  left join public.league_teams lt on lt.id = e.league_team_id
  where exists (
    select 1
    from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and (
        (m.role = 'admin' and m.club_id = e.club_id)
        or m.team_id = e.team_id
        or (e.team_id is null and m.club_id = e.club_id)
      )
  )
  and e.starts_at > now() - interval '6 months'
  and e.tournament_id is null
  order by e.starts_at;
$function$;

-- Guard: prove both invariants are in the deployed body.
do $$
begin
  if not exists (
    select 1 from pg_proc
     where proname = 'calendar_events_for_token'
       and pg_get_functiondef(oid) like '%tournament_id is null%'
       and pg_get_functiondef(oid) like '%e.team_id is null and m.club_id = e.club_id%'
  ) then
    raise exception 'FAILED: calendar_events_for_token missing the tournament or club-wide clause';
  end if;
  raise notice 'guard passed: feed excludes tournament games and includes club-wide events';
end $$;
