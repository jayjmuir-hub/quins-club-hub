-- The calendar feed learns which of the club's teams played a fixture.
-- Task 8 of claude/plans/2026-08-11-league-teams-implementation.md.
--
-- ⚠️ THE FEED'S COLUMNS ARE DECIDED HERE, NOT IN THE EDGE FUNCTION. That is the
-- whole reason this file exists: the plan described task 8 as editing
-- supabase/functions/calendar/index.ts, and that file cannot add a column to
-- its own input. The pitch was missing from the feed for a day in Aug 2026 for
-- exactly this reason and no amount of editing the function fixed it — see
-- db/migrations/20260805_calendar_feed_pitch.sql and the comment on the `Event`
-- type in the function.
--
-- ⚠️ DROP AND CREATE, NOT CREATE OR REPLACE. Postgres refuses to change an
-- existing function's return type in place ("cannot change return type of
-- existing function"), and RETURNS TABLE *is* the return type. There is no way
-- to add a column to a feed function without dropping it.
--
-- ⚠️ AND A DROP TAKES THE GRANTS WITH IT — THIS IS THE DANGEROUS HALF.
-- public.calendar_events_for_token is executable by ANON deliberately: it IS
-- the calendar feed, anon is the point, and the token is the gate. It has no
-- auth.uid() guard at all, on purpose (state-of-play.md says in as many words
-- not to "fix" that to match the other SECURITY DEFINER functions). Recreating
-- it without re-granting would leave every subscribed parent's calendar
-- failing, with nothing in the app to say why and no test that could see it.
-- The grant at the foot is the ACL measured on the LIVE function immediately
-- before this ran:
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ⚠️ LEFT JOIN, NEVER INNER. An inner join to league_teams would silently drop
-- every fixture that is NOT a league match — which is most of them, and all
-- training. The feed would simply go quiet, with a 200 and a valid .ics, and
-- nothing anywhere would error. Same silence as the zero-row 200 and the
-- truncated PostgREST read.
--
-- ⚠️ THE BODY IS OTHERWISE BYTE-FOR-BYTE THE PREVIOUS DEFINITION, read out of
-- pg_get_functiondef rather than retyped. The membership test, the club-admin
-- arm, the 6-month lookback and the ordering are unchanged and must stay so:
-- this migration is about three columns, and a feed function is not the place
-- to tidy anything up in passing.

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
  -- ⚠️ ALL THREE ARE NULL ON EVERY FIXTURE THAT IS NOT A LEAGUE MATCH, and the
  -- edge function must then render nothing at all — no division, no round, no
  -- default. Same rule src/lib/fixtureLabel.js enforces in the app, which is
  -- what stops a subscribed calendar disagreeing with the screen.
  league_team_name text,
  league_division text,
  round smallint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round
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

-- ⚠️ AND REVOKE FROM PUBLIC, WHICH THE GRANT ABOVE DOES NOT DO FOR YOU. This
-- line was added AFTER the migration first ran, because the ACL read back
-- afterwards was NOT what was read before it:
--
--   before  {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   after   {=X/postgres,          postgres=X/postgres,anon=X/postgres,...}
--            ^^^^^^^^^^^ PUBLIC
--
-- `create function` grants EXECUTE to PUBLIC by DEFAULT, and naming anon and
-- authenticated explicitly does not displace it. Nothing new could reach the
-- feed today — anon already had it and anon is what the feed uses — so this is
-- not a hole, it is DRIFT: every future role would have inherited EXECUTE, and
-- the function this widens is the one anonymous endpoint in the schema.
--
-- ⚠️ THE POINT WORTH KEEPING: "the grant survived the drop" was true and was
-- not the whole answer. Re-granting what you measured is not the same as
-- restoring what you measured, because a fresh CREATE brings a default with it.
-- Compare the whole ACL string before and after, not just the one role you were
-- worried about.
revoke execute on function public.calendar_events_for_token(uuid) from public;
