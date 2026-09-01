-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — league placeholders: events.league_team_tbd, tier 'TBD'
--  Paste into the Supabase SQL editor, or run `npm run db:check -- league-placeholders`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260901_league_placeholders.sql. Written BEFORE the
-- migration is applied (it fails until it is — that is the point).
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children.
--
-- ⚠️ WHY A COLUMN AND NOT AN OVERLOADED NULL, because a future session will
-- ask: league_team_id is a uuid FK whose null already means "a friendly", and
-- "a league round whose side is not known yet" is a DIFFERENT answer that
-- must round-trip through the edit form. Same ruling as competition_tbd on
-- 14 Aug: "not decided yet" and "not applicable" are different answers.

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
   where table_schema = 'public' and table_name = 'events' and column_name = 'league_team_tbd';

  if col is null then
    raise exception 'events.league_team_tbd is MISSING';
  end if;
  if col.data_type <> 'boolean' then
    raise exception 'events.league_team_tbd is %, expected boolean', col.data_type;
  end if;
  if col.is_nullable <> 'NO' then
    raise exception 'events.league_team_tbd is NULLABLE, expected NOT NULL';
  end if;
  if col.column_default is distinct from 'false' then
    raise exception 'events.league_team_tbd defaults to %, expected false', col.column_default;
  end if;
end $$;

-- ── STEP 2 — an insert omitting it still works, and lands false ───────────
--
-- ⚠️ PROTECTS SOMEBODY ELSE'S CODE: every writer that predates the column —
-- fan-out rows, series rows, chat's fixture threads — inserts without naming
-- it, and each must keep meaning what it meant.
do $$
declare team_row uuid; club_row uuid; new_id uuid; got boolean;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;
  if team_row is null then
    raise exception 'CONTROL FAILED: no teams exist to hang a test event on';
  end if;

  insert into public.events (club_id, team_id, type, opponent, starts_at)
  values (club_row, team_row, 'match', 'Harness Invitational XV', now() + interval '40 days')
  returning id into new_id;

  select league_team_tbd into got from public.events where id = new_id;
  if got is not false then
    raise exception 'league_team_tbd defaulted to %, expected false', got;
  end if;
end $$;

-- ── STEP 3 — a full placeholder row is ACCEPTED ───────────────────────────
--
-- The row the form now writes: league, round known, side TBD, tier TBD,
-- home unknown (null), no opponent. If any piece of this is refused the
-- feature does not exist, whatever the suite says.
do $$
declare team_row uuid; club_row uuid; new_id uuid; got record;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  insert into public.events
    (club_id, team_id, type, opponent, home, competition_type, round,
     league_team_id, league_team_tbd, tier, starts_at, time_tbd)
  values
    (club_row, team_row, 'match', null, null, 'league', 1,
     null, true, 'TBD', date_trunc('day', now() + interval '41 days'), true)
  returning id into new_id;

  select league_team_tbd, tier, home into got from public.events where id = new_id;
  if got.league_team_tbd is not true then
    raise exception 'placeholder stored league_team_tbd = %, expected true', got.league_team_tbd;
  end if;
  if got.tier is distinct from 'TBD' then
    raise exception 'placeholder stored tier = %, expected TBD', got.tier;
  end if;
  if got.home is not null then
    raise exception 'placeholder stored home = %, expected null', got.home;
  end if;
end $$;

-- ── STEP 4 — TBD *and* a named league team together is REFUSED ────────────
--
-- The contradictory pair. The form's single select makes it unreachable, but
-- the UI is not a boundary.
do $$
declare team_row uuid; club_row uuid; lt uuid; refused boolean := false;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;
  select id into lt from public.league_teams limit 1;
  if lt is null then
    -- No league teams in the database would make this step pass for the wrong
    -- reason (FK failure, not the CHECK) — so say so instead of pretending.
    raise exception 'CONTROL FAILED: no league_teams row to test the contradictory pair with';
  end if;

  begin
    insert into public.events
      (club_id, team_id, type, competition_type, league_team_id, league_team_tbd, starts_at)
    values
      (club_row, team_row, 'match', 'league', lt, true, now() + interval '42 days');
  exception when check_violation then
    refused := true;
  end;

  if not refused then
    raise exception 'a row claiming a league team AND league_team_tbd was accepted';
  end if;
end $$;

-- ── STEP 5 — tier 'TBD' is admitted, and junk is still refused ────────────
--
-- ⚠️ BOTH HALVES. Widening a CHECK by retyping it is exactly how a letter gets
-- dropped or an accidental catch-all gets in; the refusal half is the control
-- that proves the constraint still constrains.
do $$
declare team_row uuid; club_row uuid; refused boolean := false;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  begin
    insert into public.events (club_id, team_id, type, opponent, tier, starts_at)
    values (club_row, team_row, 'match', 'Harness Nomads', 'D', now() + interval '43 days');
  exception when check_violation then
    refused := true;
  end;

  if not refused then
    raise exception 'events_tier_check accepted tier = D — the widened constraint no longer constrains';
  end if;
end $$;

rollback;

-- ── STEP 6 — THE ROLLBACK ROLLED BACK, with a control ─────────────────────
do $$
begin
  if exists (select 1 from public.events where opponent in ('Harness Invitational XV', 'Harness Nomads')) then
    raise exception 'ROLLBACK FAILED: harness rows survived — clean them up NOW';
  end if;
  -- The control: the same query shape CAN see a row that certainly exists.
  if not exists (select 1 from public.events limit 1) then
    raise exception 'CONTROL FAILED: the survivors probe cannot see any events at all — its empty result above proves nothing';
  end if;
end $$;

select 'league-placeholders: ALL STEPS PASSED' as result;
