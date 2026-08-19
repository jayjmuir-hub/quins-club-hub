-- ══════════════════════════════════════════════════════════════════════════
--  FIXTURE PUSH HARNESS — what a change to the schedule notifies, and (mostly)
--  what it must NOT.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every fixture it touches is one it created itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ MOST OF THIS FILE ASSERTS SILENCE ═════════════════════════════════
--
--     ONLY A STATEMENT THAT TOUCHES EXACTLY ONE FIXTURE EVER NOTIFIES.
--
-- Measured 19 Aug 2026, before any of this was written: of 63 events, **50
-- were created as part of a repeating series, the biggest series was 18, and
-- 18 rows landed inside one minute.** A row-level trigger would have sent
-- eighteen notifications to every family in that squad the first time somebody
-- set up a term of training.
--
-- ⚠️ AND THAT IS NOT A TUNING PROBLEM. People do not turn off "too many
-- notifications", they turn off notifications — so one burst costs the club
-- every future fixture alert, permanently.
--
-- ══ HOW A "PUSH" IS OBSERVED HERE ════════════════════════════════════════
--
-- `net.http_post` writes to `net.http_request_queue`, and pg_net is
-- transactional — so counting rows in that queue counts the notifications this
-- statement WOULD have sent, and the rollback un-sends them. Nothing leaves
-- the database.
--
-- ⚠️ EVERY "expect 0" IS PAIRED WITH AN "expect 1" ON THE SAME MECHANISM.
-- Without that, a trigger that was simply broken — or a vault secret that had
-- gone missing — would satisfy every silence assertion in this file perfectly.

begin;

create function pg_temp.check_fixture_push() returns void language plpgsql as $fn$
declare
  v_club uuid; v_team uuid; v_series uuid := gen_random_uuid(); v_one uuid;
  base int; sent int;
begin
  -- ── The squad: one that actually has members, or the audience is empty ──
  select t.club_id, t.id into v_club, v_team
    from public.teams t
   where exists (select 1 from public.memberships m
                  where m.team_id = t.id and m.status = 'active')
   limit 1;

  if v_team is null then
    raise exception
      'FIXTURE PUSH: no squad with an active member. Every count below would '
      'be zero for a reason that has nothing to do with the triggers.';
  end if;

  -- ── 1. A SERIES INSERT MUST BE SILENT ───────────────────────────────────
  select count(*) into base from net.http_request_queue;
  insert into public.events (club_id, team_id, type, starts_at, series_id, time_tbd)
  select v_club, v_team, 'training', now() + interval '7 days' * g, v_series, false
    from generate_series(1, 3) g;
  select count(*) - base into sent from net.http_request_queue;
  if sent <> 0 then
    raise exception
      'FIXTURE PUSH: a 3-event series insert sent % notification(s). A term of '
      'repeating training must be silent — this is the burst that costs the '
      'club the feature. db/migrations/20260819_fixture_push.sql.', sent;
  end if;

  -- ── 2. A SINGLE ONE-OFF INSERT MUST SEND ONE ────────────────────────────
  --
  -- ⚠️ THE CONTROL FOR 1. If this is 0 the silence above proves nothing.
  select count(*) into base from net.http_request_queue;
  insert into public.events (club_id, team_id, type, starts_at, opponent, time_tbd)
       values (v_club, v_team, 'match', now() + interval '3 days', 'db:check FC', false)
    returning id into v_one;
  select count(*) - base into sent from net.http_request_queue;
  if sent <> 1 then
    raise exception
      'FIXTURE PUSH: a single new fixture sent % notification(s), expected 1. '
      'Every "must be silent" assertion in this file is then free.', sent;
  end if;

  -- ── 3. ⚠️ ENTERING A SCORE MUST BE SILENT ───────────────────────────────
  --
  -- `events` carries result_us/result_them/tries_us/... so recording a result
  -- is an UPDATE on the fixture row. A change trigger watching the whole row
  -- would buzz the whole squad every Saturday afternoon.
  select count(*) into base from net.http_request_queue;
  update public.events
     set result_us = 25, result_them = 10, tries_us = 5, conversions_us = 0
   where id = v_one;
  select count(*) - base into sent from net.http_request_queue;
  if sent <> 0 then
    raise exception
      'FIXTURE PUSH: entering a SCORE sent % notification(s). The change '
      'trigger must name only the parent-facing fields — when it is, where it '
      'is, who it is against.', sent;
  end if;

  -- ── 4. MOVING THE KICK-OFF MUST SEND ONE ────────────────────────────────
  --
  -- ⚠️ THE CONTROL FOR 3, and the pair is the whole point: the same statement
  -- type on the same row, silent for one field and loud for another.
  select count(*) into base from net.http_request_queue;
  update public.events set starts_at = starts_at + interval '2 hours' where id = v_one;
  select count(*) - base into sent from net.http_request_queue;
  if sent <> 1 then
    raise exception
      'FIXTURE PUSH: moving the kick-off sent % notification(s), expected 1. '
      'The score silence above is then meaningless.', sent;
  end if;

  -- ── 5. A BULK DELETE MUST BE SILENT ─────────────────────────────────────
  --
  -- `deleteSeriesFrom` clears the rest of a term in one statement. That is
  -- administration, and it is the insert burst in reverse.
  select count(*) into base from net.http_request_queue;
  delete from public.events where series_id = v_series;
  select count(*) - base into sent from net.http_request_queue;
  if sent <> 0 then
    raise exception
      'FIXTURE PUSH: clearing a 3-event series sent % notification(s).', sent;
  end if;

  -- ── 6. A SINGLE CANCELLATION MUST SEND ONE ──────────────────────────────
  --
  -- ⚠️ THE MOST USEFUL NOTIFICATION THIS APP SENDS — "do not drive there" —
  -- and the control for 5.
  select count(*) into base from net.http_request_queue;
  delete from public.events where id = v_one;
  select count(*) - base into sent from net.http_request_queue;
  if sent <> 1 then
    raise exception
      'FIXTURE PUSH: a single cancellation sent % notification(s), expected 1.', sent;
  end if;

  raise notice 'FIXTURE PUSH: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  FIXTURE PUSH: all checks passed.

select pg_temp.check_fixture_push();


-- ── 3. ⚠️ THE SELF-TEST — take the one-row rule out and prove it is caught ─
--
-- The fault is the obvious implementation, and the one somebody would reach
-- for while "simplifying": notify for every inserted row. It is not a silly
-- mistake — it is what a row-level trigger does by default, and it is exactly
-- the burst this whole file exists to prevent.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: FIXTURE PUSH: …

create or replace function private.notify_fixture_added()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare e public.events;
begin
  for e in select * from inserted loop
    perform private.send_fixture_push(e.club_id, e.team_id, auth.uid(), 'New fixture', e);
  end loop;
  return null;
end;
$$;

do $$
begin
  begin
    perform pg_temp.check_fixture_push();
    raise exception 'SELF-TEST FAILED: check_fixture_push() passed while the added-trigger notified for EVERY inserted row. The series-insert assertion is vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 1 really did insert fixtures on production and part 3
-- really did replace a trigger function. Both are transactional and both go
-- back here — but only if this runs. scripts/db-check.mjs refuses any file in
-- db/tests/ that could commit.

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Expected: 0, and the one-row guard present.
--
--   select count(*) from public.events where opponent = 'db:check FC';
--   select pg_get_functiondef(oid) like '%count(*) from inserted) <> 1%'
--     from pg_proc where proname = 'notify_fixture_added';
