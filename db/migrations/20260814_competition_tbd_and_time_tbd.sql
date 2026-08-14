-- "We don't know yet" becomes a thing a fixture can SAY.
-- Jay, 14 Aug 2026: a TBD option on the competition dropdown, on the round, and
-- on the start time.
--
-- ══ WHY THIS IS NOT THE 'friendly' VALUE THAT WAS ALREADY REFUSED ═══════════
--
-- `events_competition_type_check` has held exactly ('league','tournament') since
-- 12 Aug, and db/schema/tables.sql carries a tombstone next to it:
--
--     ⚠️ NO 'friendly' VALUE, DELIBERATELY. A friendly is the ABSENCE of a
--     competition, so it is NULL — adding a third value would make "not
--     answered" and "answered: friendly" indistinguishable.
--
-- ⚠️ THAT RULING STANDS AND IS NOT BEING REOPENED. It refused a value that
-- already had a representation. 'tbd' is the opposite case: today there is NO
-- way to record "this is a real competitive fixture and we do not yet know which
-- competition", and the only expressible answers are a lie (pick one) or a
-- different lie (NULL, which the app renders as "a friendly"). NULL keeps its
-- meaning exactly; this adds the state that had none.
--
-- ⚠️ SO THE THREE-STATE RULE IS NOW FOUR, AND THE DISTINCTION MATTERS TO THE
-- READER: null = a friendly (answered), 'tbd' = not answered yet, 'league' and
-- 'tournament' = answered. Nothing may collapse 'tbd' into null.
--
-- ══ START TIME: A FLAG, NOT A NULLABLE starts_at ════════════════════════════
--
-- ⚠️ `starts_at` IS `timestamptz NOT NULL` AND MUST STAY THAT WAY. Every read
-- path in the app orders by it, ranges over it and pages on it — listEvents, the
-- 18-month window, the fortnight strip, the dashboard hero, this file's own feed
-- function. Making it nullable to express "time unknown" would put a NULL into
-- the sort key of every one of those, and the failure would be a fixture
-- silently missing from a list rather than an error.
--
-- So the DATE stays real and the TIME becomes a claim about it. `time_tbd` says
-- "the clock time stored in starts_at is a placeholder, do not show it".
--
-- ⚠️ THE APP WRITES MIDNIGHT CLUB TIME as that placeholder, so a TBD fixture
-- sorts to the top of its own day rather than into an arbitrary slot. That is a
-- convention of the writer, not a rule this column enforces — nothing may read
-- "starts_at is midnight" as "the time is TBD". The flag is the only truth.
--
-- ⚠️ AND ends_at MUST BE NULL WHEN time_tbd IS TRUE. An end time is meaningless
-- without a start, and `events_ends_after_starts` would otherwise compare a real
-- finish against a placeholder midnight. Enforced below rather than left to the
-- form, because the form is not the boundary.

-- ══ 1. competition_type gains 'tbd' ═════════════════════════════════════════
--
-- Drop and re-add rather than ALTER: a CHECK constraint has no in-place widen.
-- Every existing row holds null, 'league' or 'tournament', so the re-add
-- validates without a rewrite and cannot fail on live data.
alter table public.events
  drop constraint if exists events_competition_type_check;

alter table public.events
  add constraint events_competition_type_check
  check (competition_type in ('league', 'tournament', 'tbd'));

comment on column public.events.competition_type is
  'league | tournament | tbd. NULL means neither - a friendly - and is a real '
  'answer, never "assume league". tbd means the competition is not yet decided, '
  'which is NOT the same as NULL and must never be collapsed into it. `round` '
  'belongs to league; `competition` holds the tournament name. Deliberately NOT '
  'derived from `round`: a league fixture whose round is not yet known would '
  'otherwise read as a friendly.';

-- ══ 2. time_tbd ═════════════════════════════════════════════════════════════
--
-- NOT NULL DEFAULT false, so every existing fixture keeps exactly the meaning it
-- has today and no read path has to cope with a third state. Postgres stores the
-- default in the catalogue rather than rewriting the table, so this is cheap
-- even once the club has a full season of fixtures.
alter table public.events
  add column if not exists time_tbd boolean not null default false;

comment on column public.events.time_tbd is
  'True when the kick-off time is not yet known. starts_at still holds a real '
  'DATE (the app writes midnight club time as the placeholder) because starts_at '
  'is NOT NULL and every read path sorts and pages on it - do not make it '
  'nullable to express this. Readers must render the time as "TBD" and the '
  'calendar feed must emit an ALL-DAY entry. Nothing may infer this flag from a '
  'midnight starts_at: the flag is the only truth.';

-- ⚠️ ends_at MUST BE NULL WHEN THE START IS UNKNOWN. Without this a fixture
-- could carry a 15:30 finish against a placeholder midnight start, which
-- `events_ends_after_starts` would happily accept (00:00 < 15:30) and every
-- calendar would render as a 15.5-hour event.
alter table public.events
  drop constraint if exists events_no_end_when_time_tbd;

alter table public.events
  add constraint events_no_end_when_time_tbd
  check (time_tbd = false or ends_at is null);

-- ══ 3. THE FEED FUNCTION MUST LEARN THE COLUMN ══════════════════════════════
--
-- ⚠️ THE FEED'S COLUMNS ARE DECIDED HERE, NOT IN THE EDGE FUNCTION — the point
-- db/migrations/20260812_calendar_feed_league_team.sql makes at length, and the
-- reason the pitch was missing from the feed for a day in Aug 2026 while
-- somebody edited index.ts. Without this the function cannot see time_tbd and
-- every TBD fixture would go into parents' calendars at midnight.
--
-- ⚠️ DROP AND CREATE, NOT CREATE OR REPLACE. RETURNS TABLE *is* the return type
-- and Postgres refuses to change one in place.
--
-- ⚠️ AND A DROP TAKES THE GRANTS WITH IT. anon executes this deliberately — it
-- IS the calendar feed and the token is the gate. The grant and the REVOKE FROM
-- PUBLIC at the foot are both mandatory; `create function` grants EXECUTE to
-- PUBLIC by default, which is drift the previous migration caught the hard way.
--
-- ⚠️ THE BODY IS OTHERWISE BYTE-FOR-BYTE THE PREVIOUS DEFINITION. One column is
-- being added; a feed function is not the place to tidy anything in passing.
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
  round smallint,
  -- ⚠️ THE FEED MUST EMIT AN ALL-DAY ENTRY WHEN THIS IS TRUE, not a timed one at
  -- the placeholder midnight. A parent seeing "00:00" for a fixture whose time
  -- nobody has set is the same class of invented value as the per-type duration
  -- guess that `ends_at` was added to kill.
  time_tbd boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd
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

-- ⚠️ MANDATORY, AND THE GRANT ABOVE DOES NOT DO IT FOR YOU. See the previous
-- migration: `create function` grants EXECUTE to PUBLIC by default, and naming
-- anon and authenticated explicitly does not displace it.
revoke execute on function public.calendar_events_for_token(uuid) from public;

-- ══ 4. GUARD ════════════════════════════════════════════════════════════════
--
-- A migration that has never been checked is a migration that might not have
-- run. Raises rather than notices on a miss, so a partial apply cannot be read
-- as a success in the SQL editor's output pane.
do $$
declare
  ok_tbd    boolean;
  ok_col    boolean;
  ok_end    boolean;
  ok_feed   boolean;
begin
  select pg_get_constraintdef(oid) like '%tbd%'
    into ok_tbd
    from pg_constraint
   where conrelid = 'public.events'::regclass
     and conname  = 'events_competition_type_check';

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'events' and column_name = 'time_tbd'
  ) into ok_col;

  select exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass
       and conname  = 'events_no_end_when_time_tbd'
  ) into ok_end;

  select exists (
    select 1 from pg_proc p
     where p.proname = 'calendar_events_for_token'
       and pg_get_function_result(p.oid) like '%time_tbd%'
  ) into ok_feed;

  if not coalesce(ok_tbd, false) then
    raise exception 'FAILED: events_competition_type_check does not allow tbd';
  end if;
  if not ok_col then
    raise exception 'FAILED: events.time_tbd was not created';
  end if;
  if not ok_end then
    raise exception 'FAILED: events_no_end_when_time_tbd was not created';
  end if;
  if not ok_feed then
    raise exception 'FAILED: calendar_events_for_token does not return time_tbd';
  end if;

  raise notice 'guard passed: competition_type allows tbd, events.time_tbd exists, end-time guard in place, feed returns time_tbd';
end $$;
