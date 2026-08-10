-- ══════════════════════════════════════════════════════════════════════════
--  public.set_series_time_from — move the time of day for the rest of a series
--  10 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS NEEDS A FUNCTION AT ALL, when deleting a series did not.
-- Every other series-wide edit sets the SAME value on every row — venue,
-- pitch, title, type, opponent, competition, notes — and PostgREST does that
-- in one statement with no help from here. The time cannot work that way: each
-- occurrence has its OWN date, so "training moves to 6:30 for the rest of
-- term" is a different `starts_at` per row, computed from that row's date.
--
-- The alternatives were both worse. Fetching the rows and updating each one is
-- N round trips and not atomic — a failure halfway leaves half a term at the
-- old time and half at the new, with nothing on screen saying which. Skipping
-- time changes entirely would mean the form silently ignoring the single most
-- likely reason anyone edits a series, which is the lying-UI failure this
-- codebase keeps writing rules about.
--
-- ⚠️ SECURITY INVOKER, DELIBERATELY, AND THIS IS THE WHOLE SAFETY ARGUMENT.
-- The UPDATE is evaluated as the caller, so `event edit`
-- (private.can_edit_team) filters it exactly as it filters a PostgREST update.
-- This function grants nothing. A SECURITY DEFINER version would have to
-- re-implement the check by hand, and the one it must not get wrong is the
-- one that was just fixed today (can_edit_team's status gate).
--
-- ⚠️ FUTURE ONLY — `starts_at >= _from`, matching Jay's 8 Aug ruling for
-- deletes and for the same reason: sessions already played carry results and
-- attendance, and a coach moving the rest of a term is not asking to rewrite
-- history. It is >= and not >, so the occurrence being edited moves too, which
-- is what "this and all later sessions" says on the button.
--
-- ⚠️ SCOPE: series_id ONLY. group_id (the multi-squad fan-out) is deliberately
-- NOT handled, exactly as deleteSeriesFrom is not — Jay deferred it 8 Aug 2026.
-- Reaching across squads has a different blast radius, because there RLS
-- really would make the write genuinely partial rather than all-or-nothing.
--
-- ⚠️ DURATION IS PRESERVED, NOT RECOMPUTED. `ends_at` moves by the same amount
-- as `starts_at` (`new_start + (ends_at - starts_at)`), so a 90-minute session
-- stays 90 minutes. Setting a fixed end time instead would silently restretch
-- every occurrence to match whichever one happened to be open in the form. A
-- null `ends_at` stays null rather than being invented.
--
-- ⚠️ ALL SET EXPRESSIONS SEE THE OLD ROW. Postgres evaluates the whole SET
-- list against the pre-update values, so `e.ends_at - e.starts_at` below is
-- the ORIGINAL duration even though `starts_at` is being assigned in the same
-- statement. That is what makes this safe as one statement rather than two.
--
-- ⚠️ Asia/Dubai is hard-coded to match CLUB_TIME_ZONE in
-- src/lib/eventFormat.js. The club's calendar is Abu Dhabi's; using the
-- server's zone would move a 6pm training by four hours.

create or replace function public.set_series_time_from(
  _series uuid,
  _from timestamptz,
  _hh int,
  _mm int
)
returns setof events
language sql
security invoker
set search_path to 'public'
as $$
  update events e
     set starts_at =
           (date_trunc('day', e.starts_at at time zone 'Asia/Dubai')
             + make_interval(hours => _hh, mins => _mm)) at time zone 'Asia/Dubai',
         ends_at =
           case
             when e.ends_at is null then null
             else ((date_trunc('day', e.starts_at at time zone 'Asia/Dubai')
                     + make_interval(hours => _hh, mins => _mm)) at time zone 'Asia/Dubai')
                  + (e.ends_at - e.starts_at)
           end
   where e.series_id = _series
     and e.starts_at >= _from
  returning e.*;
$$;

revoke all on function public.set_series_time_from(uuid, timestamptz, int, int) from public;
grant execute on function public.set_series_time_from(uuid, timestamptz, int, int) to authenticated;
