-- Events: a real end time, and a free-text info field.
--
-- Apply as migration `20260808xxxxxx event_end_time_and_notes`.
--
-- ── WHY ends_at ──────────────────────────────────────────────────────────
-- ⚠️ THE CALENDAR FEED HAS BEEN INVENTING ONE ALL ALONG.
-- supabase/functions/calendar/index.ts:117 carries
--     const DURATION_MINUTES = { match: 120, training: 90, social: 120 }
-- and stamps DTEND as start + that. So every fixture already sitting in a
-- parent's phone calendar has an end time; it is simply made up. This column
-- replaces the guess with the truth where we have it.
--
-- ── NULLABLE, THOUGH THE FORM REQUIRES IT ────────────────────────────────
-- Jay's ruling 8 Aug: an end time is REQUIRED on every new event. That is
-- enforced in EventForm, deliberately NOT with NOT NULL here.
--
-- `NOT NULL` would be correct today — there are 0 events after the wipe, so
-- there is nothing to backfill and no reason it would fail. It is still the
-- wrong call, because the club's new site is planned to become the master for
-- fixtures (claude/decisions/2026-08-08-... and the AWS migration plan), and a
-- feed from a system we do not control is exactly the thing that will arrive
-- without an end time. A NOT NULL then means a hard insert failure on data we
-- cannot fix, versus a row that falls back to the existing per-type guess.
--
-- **If fixtures never come from outside, tighten this to NOT NULL later.**
--
-- ── THE CHECK IS THE REAL GUARD ──────────────────────────────────────────
-- A form validation is a courtesy; this is the boundary. An end before its
-- start silently produces a negative-length calendar entry, which different
-- calendar clients render in different and uniformly wrong ways.

alter table public.events
  add column if not exists ends_at timestamptz;

alter table public.events
  add column if not exists notes text;

comment on column public.events.ends_at is
  'When the event finishes. Required by EventForm, nullable here so an external '
  'fixture feed cannot hard-fail. NULL falls back to the per-type duration guess '
  'in supabase/functions/calendar/index.ts.';

comment on column public.events.notes is
  'Free text shown on the event detail sheet and in the calendar DESCRIPTION. '
  'Written by squad staff for that squad — treat as squad-visible, not private.';

-- Separate statement and named, so a failure names itself in the error rather
-- than arriving as an anonymous constraint violation.
alter table public.events
  drop constraint if exists events_ends_after_starts;

alter table public.events
  add constraint events_ends_after_starts
  check (ends_at is null or ends_at > starts_at);

-- ── VERIFY (run these; do not assume) ────────────────────────────────────
--   insert into public.events (club_id, team_id, type, starts_at, ends_at)
--   select club_id, id, 'training', now() + interval '1 day',
--                                    now() + interval '1 day' - interval '1 hour'
--   from public.teams limit 1;
--   -- EXPECTED: 23514 violates check constraint "events_ends_after_starts"
--
--   -- and the same with a valid end must succeed, otherwise the check above
--   -- proves nothing about which direction it is guarding.
