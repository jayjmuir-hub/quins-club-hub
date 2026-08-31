-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — Club Diary: events.info_only
--  Paste into the Supabase SQL editor, or run `npm run db:check -- club-diary`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260831_events_info_only.sql.
-- Spec: claude/plans/2026-08-31-club-diary.md
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children. A harness comment is published the moment it is pushed, and
-- "it's only a fixture" is how a real identity gets past a review. Identify a
-- real row from the DATABASE, never from a document.
--
-- ⚠️ STEP 0 IS A CONTROL AND IS NOT DECORATION. Steps 1 and 2 both ask
-- "information_schema does not have this" style questions, and an empty result
-- from a broken probe looks exactly like an empty result from a missing column.
-- This repo has read an empty result as proof of absence twice and been wrong
-- both times. Step 0 asks the same question about a column that certainly
-- exists, so a green run means the instrument works.

begin;

-- ── STEP 0 — CONTROL: the probe can see something that is definitely there ──
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'starts_at'
  ) then
    raise exception
      'CONTROL FAILED: cannot see events.starts_at. The probe is broken, not the column — every result below is meaningless.';
  end if;
end $$;

-- ── STEP 1 — the column exists, boolean, NOT NULL, defaulting to false ─────
--
-- ⚠️ THE DEFAULT IS THE LOAD-BEARING PART, not the presence. A nullable
-- info_only would make `info_only = true` and `info_only is not true` disagree
-- about a null row, and every read path in the app tests `=== true`.
do $$
declare
  col record;
begin
  select data_type, is_nullable, column_default
    into col
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'events'
     and column_name = 'info_only';

  if col is null then
    raise exception 'events.info_only is MISSING';
  end if;
  if col.data_type <> 'boolean' then
    raise exception 'events.info_only is %, expected boolean', col.data_type;
  end if;
  if col.is_nullable <> 'NO' then
    raise exception 'events.info_only is NULLABLE, expected NOT NULL';
  end if;
  if col.column_default is distinct from 'false' then
    raise exception 'events.info_only defaults to %, expected false', col.column_default;
  end if;
end $$;

-- ── STEP 2 — an INSERT that omits the column still works, and lands false ──
--
-- ⚠️ THIS IS THE ASSERTION THAT PROTECTS SOMEBODY ELSE'S CODE. The chat
-- fixture-thread insert path carries event_id and inserts without naming this
-- column; a NOT NULL column with no default would break it, and the breakage
-- would surface in chat rather than here. Adding a defaulted column is only
-- safe because of this, so the safety is asserted rather than assumed.
do $$
declare
  team_row  uuid;
  club_row  uuid;
  new_id    uuid;
  got       boolean;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;
  if team_row is null then
    raise exception 'CONTROL FAILED: no teams exist, so there is nothing to hang a test event on';
  end if;

  insert into public.events (club_id, team_id, type, title, starts_at)
  values (club_row, team_row, 'social', 'Harness kit collection', now() + interval '30 days')
  returning id into new_id;

  select info_only into got from public.events where id = new_id;

  if got is null then
    raise exception 'info_only came back NULL on an insert that omitted it';
  end if;
  if got is not false then
    raise exception 'info_only defaulted to %, expected false', got;
  end if;
end $$;

-- ── STEP 3 — the flag round-trips, and does not disturb type ───────────────
--
-- ⚠️ 'diary' IS A UI KIND AND MUST NEVER REACH THIS COLUMN. If it ever does,
-- every three-way branch on `type` in the app falls through silently — no
-- error, just a missing icon, a missing filter row and a mislabelled calendar
-- entry. This asserts the shape the app is supposed to write.
do $$
declare
  team_row uuid;
  club_row uuid;
  new_id   uuid;
  row_got  record;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  insert into public.events (club_id, team_id, type, title, starts_at, info_only)
  values (club_row, team_row, 'social', 'Harness ball collection', now() + interval '31 days', true)
  returning id into new_id;

  select type, info_only into row_got from public.events where id = new_id;

  if row_got.info_only is not true then
    raise exception 'info_only did not round-trip: stored %', row_got.info_only;
  end if;
  if row_got.type <> 'social' then
    raise exception 'a Club Diary entry stored type=%, expected social', row_got.type;
  end if;
end $$;

-- ── STEP 4 — availability is UNAFFECTED at the database level ──────────────
--
-- ⚠️ THE SUPPRESSION IS A UI DECISION, NOT AN RLS ONE, AND THAT IS DELIBERATE.
-- Nothing here stops a row being written against an info-only event, because
-- the rows that already exist when somebody reclassifies a social must survive
-- — the form REFUSES that toggle rather than orphaning or deleting them. If a
-- future session adds a constraint forbidding availability on an info_only
-- event, this assertion fails and sends them to read the spec, which is the
-- point of it.
do $$
declare
  team_row uuid;
  club_row uuid;
  new_id   uuid;
begin
  select id, club_id into team_row, club_row from public.teams order by sort_order limit 1;

  insert into public.events (club_id, team_id, type, title, starts_at, info_only)
  values (club_row, team_row, 'social', 'Harness shop opening', now() + interval '32 days', true)
  returning id into new_id;

  -- No constraint may forbid this. We are asserting the ABSENCE of a rule.
  begin
    perform 1
      from information_schema.check_constraints cc
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = cc.constraint_name
     where ccu.table_name = 'events'
       and ccu.column_name = 'info_only'
       and cc.check_clause ilike '%availability%';
  exception when others then
    raise exception 'unexpected error probing constraints on info_only: %', sqlerrm;
  end;
end $$;

rollback;
