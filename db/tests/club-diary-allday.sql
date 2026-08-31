-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — Club Diary phase 2: events.all_day, and the third time state
--  Paste into the Supabase SQL editor, or run `npm run db:check -- allday`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260901_events_all_day.sql.
-- Spec: claude/plans/2026-08-31-club-diary.md (the [PHASE 2] sections).
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children.
--
-- ⚠️ THE POINT OF THE COLUMN, because it looks redundant next to time_tbd and a
-- future session WILL try to merge them. `time_tbd` means "the day is known and
-- the time is not decided yet" and the calendar feed prints "Kick-off time to be
-- confirmed" for it. `all_day` means "there is no clock time at all". Merging
-- them would put that sentence into every subscribed parent's calendar for a kit
-- collection, which is simply false. Same ruling as competition_tbd on 14 Aug:
-- "not decided yet" and "not applicable" are different answers.

begin;

-- ── STEP 0 — CONTROL: the probe can see a column that certainly exists ─────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'starts_at'
  ) then
    raise exception
      'CONTROL FAILED: cannot see events.starts_at. The probe is broken, not the column — every result below is meaningless.';
  end if;
end $$;

-- ── STEP 1 — the column exists, boolean, NOT NULL, defaulting to false ────
do $$
declare col record;
begin
  select data_type, is_nullable, column_default into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'all_day';

  if col is null then
    raise exception 'events.all_day is MISSING';
  end if;
  if col.data_type <> 'boolean' then
    raise exception 'events.all_day is %, expected boolean', col.data_type;
  end if;
  if col.is_nullable <> 'NO' then
    raise exception 'events.all_day is NULLABLE, expected NOT NULL';
  end if;
  if col.column_default is distinct from 'false' then
    raise exception 'events.all_day defaults to %, expected false', col.column_default;
  end if;
end $$;

-- ── STEP 2 — an insert omitting it still works, and lands false ───────────
--
-- ⚠️ PROTECTS SOMEBODY ELSE'S CODE, exactly as the info_only harness does. The
-- chat fixture-thread insert path carries event_id and names neither column.
do $$
declare team_row uuid; club_row uuid; new_id uuid; got boolean;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;
  if team_row is null then
    raise exception 'CONTROL FAILED: no teams exist to hang a test event on';
  end if;

  insert into public.events (club_id, team_id, type, title, starts_at)
  values (club_row, team_row, 'social', 'Harness plain social', now() + interval '40 days')
  returning id into new_id;

  select all_day into got from public.events where id = new_id;
  if got is not false then
    raise exception 'all_day defaulted to %, expected false', got;
  end if;
end $$;

-- ── STEP 3 — all_day AND time_tbd together is REFUSED ─────────────────────
--
-- ⚠️ THE CONSTRAINT IS THE GUARANTEE; THE FORM'S THREE-WAY CONTROL IS ONLY THE
-- UI. Without this a row could claim both "there is no time" and "the time is
-- not chosen yet", and the feed's all-day branch would have to guess which
-- sentence to print.
do $$
declare team_row uuid; club_row uuid; refused boolean := false;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  begin
    insert into public.events (club_id, team_id, type, title, starts_at, all_day, time_tbd)
    values (club_row, team_row, 'social', 'Harness impossible state',
            date_trunc('day', now() + interval '41 days'), true, true);
  exception when check_violation then
    refused := true;
  end;

  if not refused then
    raise exception 'a row claiming BOTH all_day and time_tbd was accepted';
  end if;
end $$;

-- ── STEP 4 — CONTROL: a legal all-day row is ACCEPTED ─────────────────────
--
-- ⚠️ WITHOUT THIS, STEP 3 PASSES FOR THE WRONG REASON. A constraint that
-- refused every insert — or a typo making every row invalid — would satisfy
-- step 3 perfectly. This is the "a negative check that fails for the wrong
-- reason proves nothing" rule, made concrete.
do $$
declare team_row uuid; club_row uuid; new_id uuid; got record;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  insert into public.events (club_id, team_id, type, title, starts_at, all_day)
  values (club_row, team_row, 'social', 'Harness kit collection',
          date_trunc('day', now() + interval '42 days'), true)
  returning id into new_id;

  select all_day, time_tbd, ends_at into got from public.events where id = new_id;
  if got.all_day is not true then
    raise exception 'a legal all-day row stored all_day = %', got.all_day;
  end if;
  if got.time_tbd is not false then
    raise exception 'a legal all-day row stored time_tbd = %, expected false', got.time_tbd;
  end if;
  if got.ends_at is not null then
    raise exception 'a one-day all-day row stored ends_at = %, expected null', got.ends_at;
  end if;
end $$;

-- ── STEP 5 — a MULTI-DAY all-day span is accepted ─────────────────────────
do $$
declare team_row uuid; club_row uuid; new_id uuid; got record;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  insert into public.events (club_id, team_id, type, title, starts_at, ends_at, all_day)
  values (club_row, team_row, 'social', 'Harness two-day collection',
          date_trunc('day', now() + interval '43 days'),
          date_trunc('day', now() + interval '44 days'), true)
  returning id into new_id;

  select starts_at, ends_at into got from public.events where id = new_id;
  if got.ends_at <= got.starts_at then
    raise exception 'the span did not store: starts % ends %', got.starts_at, got.ends_at;
  end if;
end $$;

-- ── STEP 6 — a ONE-day all-day row may not set ends_at = starts_at ────────
--
-- ⚠️ ALREADY ENFORCED BY events_ends_after_starts, AND THAT IS WHY THIS STEP IS
-- HERE RATHER THAN A NEW CONSTRAINT. The spec requires a one-day all-day event
-- to leave ends_at NULL; the existing check already refuses the alternative, so
-- this asserts the rule is covered rather than adding a second rule that says
-- the same thing. If somebody ever relaxes events_ends_after_starts, this fails
-- and sends them to read why.
do $$
declare team_row uuid; club_row uuid; refused boolean := false; d timestamptz;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;
  d := date_trunc('day', now() + interval '45 days');

  begin
    insert into public.events (club_id, team_id, type, title, starts_at, ends_at, all_day)
    values (club_row, team_row, 'social', 'Harness zero-length day', d, d, true);
  exception when check_violation then
    refused := true;
  end;

  if not refused then
    raise exception 'a zero-length all-day row (ends_at = starts_at) was accepted';
  end if;
end $$;

-- ── STEP 7 — the calendar feed can SEE both flags ────────────────────────
--
-- ⚠️ THE FEED IS THE HARDEST PLACE IN THIS APP TO WITHDRAW A MISTAKE. A wrong
-- entry that has synced to a parent's phone stays wrong until their calendar
-- refetches, and some clients cache hard. So the column reaching the function
-- is asserted here rather than discovered when an all-day event renders as a
-- midnight appointment.
--
-- ⚠️ THE FUNCTION IS `public.calendar_events_for_token`, NOT `calendar_feed`.
-- The migration FILES are named calendar_feed*.sql and the spec and plan both
-- inherited that name from the filenames — so a probe written from the
-- documentation raises "function does not exist" rather than returning a wrong
-- answer, which is the lucky version of that mistake. A file name is not an
-- object name; resolve the object.
--
-- ⚠️ ASSERTED ON THE RETURN SIGNATURE, not on the body. The function is
-- replaced wholesale by migrations; a body check would break on any unrelated
-- edit, while the signature is the actual contract the Deno edge function
-- reads. Same reasoning as the pg_get_function_result assertion in
-- db/migrations/20260814_calendar_feed_competition_type.sql.
do $$
declare sig text;
begin
  select pg_get_function_result(oid) into sig
    from pg_proc
   where oid = 'public.calendar_events_for_token(uuid)'::regprocedure;

  if not found then
    raise exception 'PROBE FAILED: could not resolve public.calendar_events_for_token(uuid) to read its signature';
  end if;

  -- CONTROL: the signature contains something we know is there. Without it, a
  -- signature read as an empty string would satisfy both checks below by
  -- containing nothing at all.
  if sig not like '%time_tbd boolean%' then
    raise exception
      'CONTROL FAILED: calendar_events_for_token''s signature does not mention time_tbd — the probe is reading the wrong thing: %', sig;
  end if;

  if sig not like '%all_day boolean%' then
    raise exception 'calendar_events_for_token does not return all_day — an all-day event would render as a midnight appointment: %', sig;
  end if;
  if sig not like '%info_only boolean%' then
    raise exception 'calendar_events_for_token does not return info_only: %', sig;
  end if;
end $$;

rollback;
