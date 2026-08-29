-- The calendar feed stops emitting a tournament's individual GAMES.
--
-- A tournament is one entry a family subscribes to for the day; the games
-- played inside it (see db/migrations/20260829_events_tournament_id.sql) are
-- children shown only inside the tournament, never loose on the schedule. A
-- feed that emitted both would put "Al Ain Tournament" AND three "Quins vs …"
-- games into every subscriber's phone on the same morning — the duplication the
-- whole container model exists to avoid.
--
-- ⚠️ THE RULE IS `tournament_id IS NULL` = "a top-level calendar entry", and it
-- is added HERE for the same reason competition_type had to be added here on
-- 14 Aug: the feed reads what this function's body selects, and nothing else.
-- src/data/events.js listEvents carries the identical filter for the in-app
-- schedule; the two must agree, exactly as the tournament NAME rendering had to
-- agree across eventFormat.js and this feed.
--
-- ⚠️ CREATE OR REPLACE, NOT DROP + CREATE. The RETURNS TABLE is UNCHANGED - only
-- one predicate is added to the WHERE - so the return type is not being altered
-- and CREATE OR REPLACE is legal. That matters: a DROP takes the ACL with it
-- (the {anon,authenticated,service_role} + revoke-from-public dance documented
-- against this function in db/schema/functions.sql, and the day it was missed).
-- Replacing the body in place leaves every grant exactly as measured, so no
-- grant or revoke is repeated here. The body is otherwise byte-for-byte the
-- 20260814_calendar_feed_competition_type version.

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
  -- ⚠️ THE ONE NEW LINE: a tournament's games are shown inside the tournament,
  -- not as their own calendar entries. A container (tournament_id null) and
  -- every ordinary fixture pass; a game (tournament_id set) is filtered out.
  and e.tournament_id is null
  order by e.starts_at;
$function$;

-- ── Guard: prove the filter is in the deployed body ─────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc
     where proname = 'calendar_events_for_token'
       and pg_get_functiondef(oid) like '%tournament_id is null%'
  ) then
    raise exception 'FAILED: calendar_events_for_token does not filter tournament_id is null';
  end if;
  raise notice 'guard passed: feed excludes tournament games';
end $$;
