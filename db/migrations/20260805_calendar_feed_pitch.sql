-- Applied to Supabase as "calendar_feed_returns_pitch" then
-- "calendar_feed_revoke_public_execute", 5 Aug 2026.
--
-- The calendar feed never carried the pitch, and no amount of editing the
-- edge function would have fixed it: this function's RETURNS TABLE did not
-- include the column, so the pitch never left the database.
--
-- ⚠️ DROP then CREATE, not CREATE OR REPLACE. Postgres refuses to change the
-- return type of an existing function, and adding a column to RETURNS TABLE
-- is a return-type change.
--
-- ⚠️ THE DROP LOSES THE ACL. The grants at the bottom are not optional:
-- without them PostgREST calls this as `anon`, gets a permission error, and
-- every subscribed calendar in the club silently stops updating -- the worst
-- kind of failure here, because a stale calendar looks exactly like a
-- calendar with no new fixtures. The whole thing runs in one transaction, so
-- the feed is never live with the function dropped or ungranted.
drop function if exists public.calendar_events_for_token(uuid);

create function public.calendar_events_for_token(_token uuid)
returns table(
  id uuid,
  type text,
  title text,
  opponent text,
  home boolean,
  venue text,
  pitch text,
  competition text,
  starts_at timestamp with time zone,
  team_name text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, t.name as team_name
  from public.events e
  join public.teams t on t.id = e.team_id
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

-- Restores exactly the ACL the dropped function had.
grant execute on function public.calendar_events_for_token(uuid)
  to anon, authenticated, service_role;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and the original had
-- that revoked -- its ACL was exactly postgres/anon/authenticated/service_role.
-- Not a practical widening (`anon` is the role PostgREST uses for an
-- unauthenticated request and holds EXECUTE either way), but the grant should
-- match what was there before rather than drift wider through a default.
revoke execute on function public.calendar_events_for_token(uuid) from public;
