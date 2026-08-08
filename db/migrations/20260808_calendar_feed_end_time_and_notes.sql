-- Calendar feed: return the real end time, and the additional info.
--
-- Apply as migration `20260808xxxxxx calendar_feed_end_time_and_notes`.
--
-- ⚠️ THE EDGE FUNCTION CHANGE IS INERT WITHOUT THIS. Everything the feed can
-- ever show comes out of calendar_events_for_token(), and its RETURNS TABLE
-- is the gate: a column that is not listed there never leaves the database,
-- however carefully supabase/functions/calendar/index.ts reads it. That is
-- not a theory — the pitch was missing from every subscribed calendar in the
-- club for a day in Aug 2026 for exactly this reason, and the fix was
-- db/migrations/20260805_calendar_feed_pitch.sql, not the edge function.
--
-- Adds:
--   ends_at  -- replaces the invented DTEND (DURATION_MINUTES in the edge
--              function) with the truth where a coach has entered one. The
--              guess stays as the fallback: ends_at is nullable on purpose
--              (see 20260808_event_end_time_and_notes.sql) and every event
--              created before that migration has none.
--   notes    -- goes into DESCRIPTION.
--
-- ⚠️ THE NOTES COLUMN LEAVES THE APP HERE. A calendar feed URL is a BEARER
-- CREDENTIAL that ends up in phone backups, shared calendars and
-- screenshots. `notes` is squad-visible free text by definition (the column
-- comment says so, and EventForm's hint tells the coach so before they type)
-- — so this widens the blast radius of a leaked feed URL from "their
-- fixtures" to "their fixtures and whatever a coach wrote about them".
-- Judged acceptable on 8 Aug 2026 because the note is the thing a parent
-- most needs at the point they read the calendar entry ("meet at the gate 30
-- minutes before"), and because it is already visible to everyone the token
-- represents. It is still a widening, and it is recorded here rather than
-- discovered later.
--
-- ⚠️ DROP then CREATE, not CREATE OR REPLACE. Postgres refuses to change the
-- return type of an existing function, and adding a column to RETURNS TABLE
-- is a return-type change.
--
-- ⚠️ THE DROP LOSES THE ACL. The grants at the bottom are not optional:
-- without them PostgREST calls this as `anon`, gets a permission error, and
-- every subscribed calendar in the club silently stops updating — the worst
-- kind of failure here, because a stale calendar looks exactly like a
-- calendar with no new fixtures. The whole thing runs in one transaction, so
-- the feed is never live with the function dropped or ungranted.
--
-- Everything else — the visibility rule mirroring private.can_see_team, the
-- six-month horizon, the zero-rows-for-an-unknown-token behaviour — is
-- carried over UNCHANGED from 20260805_calendar_feed_pitch.sql. Read the
-- header of 20260804_calendar_feed.sql before touching any of it.

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
  ends_at timestamp with time zone,
  notes text,
  team_name text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name
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
-- that revoked.
revoke execute on function public.calendar_events_for_token(uuid) from public;

-- ── VERIFY (run these; do not assume) ────────────────────────────────────
--   select ends_at, notes from public.calendar_events_for_token(
--     (select token from public.calendar_tokens limit 1)) limit 5;
--   -- EXPECTED: the two columns exist and carry whatever the events hold.
--   -- A "column does not exist" here means the function was not replaced.
--
--   -- Then fetch the live feed and look at a VEVENT for an event that HAS an
--   -- ends_at: its DTEND must be that instant, not start + 90/120 minutes.
--   -- ⚠️ Redeploy the edge function too — the SQL alone changes nothing a
--   -- calendar client can see.
