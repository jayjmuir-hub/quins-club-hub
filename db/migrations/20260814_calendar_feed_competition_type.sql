-- The calendar feed learns whether a fixture is a TOURNAMENT.
--
-- Jay, 14 Aug 2026, from the live schedule: a tournament entered for U16B read
-- "Quins vs Al Ain Tournament". A tournament is not played against one side, so
-- it is NAMED rather than opposed. src/lib/eventFormat.js now renders the
-- tournament's own name, and the feed has to agree — a parent reading
-- "Al Ain Tournament" on screen and "U16B Contact v Al Ain Tournament" in their
-- phone's calendar is the exact drift the duplicated helpers in
-- supabase/functions/calendar/index.ts are warned about.
--
-- ⚠️ THE FEED COULD NOT SEE `competition_type` AT ALL. It receives `competition`
-- (the tournament's name) but never the type, so it had no way to tell a
-- tournament from a legacy row carrying arbitrary free text. The edge function
-- cannot add a column to its own input — that is decided HERE, by this
-- function's RETURNS TABLE, which is the point
-- db/migrations/20260812_calendar_feed_league_team.sql makes at length and the
-- reason the pitch was missing from the feed for a day in Aug 2026.
--
-- ⚠️ REJECTED: inferring it from `competition` being non-null. That is what the
-- APP does for rows predating the column, and it is very nearly right — the app
-- nulls `competition` for a league fixture and for a friendly, so a non-null
-- value does imply a tournament today. It was refused because "very nearly
-- right, by a convention the writer happens to follow" is how the two sides
-- drift apart later, and this is the file whose whole job is to stop that.
-- Sending the column costs one word in a select list.
--
-- ⚠️ DROP AND CREATE, NOT CREATE OR REPLACE. RETURNS TABLE *is* the return type
-- and Postgres refuses to change one in place.
--
-- ⚠️ AND A DROP TAKES THE GRANTS WITH IT. anon executes this deliberately — it
-- IS the calendar feed and the token is the gate. The grant AND the
-- `revoke ... from public` at the foot are both mandatory: `create function`
-- grants EXECUTE to PUBLIC by default, and naming anon explicitly does not
-- displace it. The ACL measured immediately before this ran, which is what must
-- be true again afterwards:
--   postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres
--
-- ⚠️ THE BODY IS OTHERWISE UNCHANGED from 20260814_competition_tbd_and_time_tbd.
-- One column is being added; a feed function is not the place to tidy anything.

drop function if exists public.calendar_events_for_token(uuid);

create function public.calendar_events_for_token(_token uuid)
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
  -- ⚠️ 'tbd' IS A LEGAL VALUE HERE and the function must render NOTHING special
  -- for it — an undecided competition is not a tournament, and labelling it one
  -- is the mis-filing the TBD option exists to prevent.
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
  join public.teams t on t.id = e.team_id
  left join public.league_teams lt on lt.id = e.league_team_id
  where exists (
    select 1
    from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and (
        (m.role = 'admin' and m.club_id = t.club_id)
        or m.team_id = e.team_id
      )
  )
  and e.starts_at > now() - interval '6 months'
  order by e.starts_at;
$function$;

grant execute on function public.calendar_events_for_token(uuid)
  to anon, authenticated, service_role;

revoke execute on function public.calendar_events_for_token(uuid) from public;

do $$
begin
  if not exists (
    select 1 from pg_proc
     where proname = 'calendar_events_for_token'
       and pg_get_function_result(oid) like '%competition_type text%'
  ) then
    raise exception 'FAILED: calendar_events_for_token does not return competition_type';
  end if;
  raise notice 'guard passed: feed returns competition_type';
end $$;
