-- ══════════════════════════════════════════════════════════════════════════
--  events.all_day — the third time state
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/plans/2026-08-31-club-diary.md (the [PHASE 2] sections)
-- Plan:    claude/plans/2026-09-01-club-diary-phase-2-implementation.md
-- Harness: db/tests/club-diary-allday.sql (written FIRST and watched failing)
--
-- WHAT IT IS FOR. A kit collection that runs all Thursday, a tournament day, a
-- two-day ball collection. Until now an event could only say "here is the time"
-- or "the time is not decided yet"; it could not say "there is no clock time".
--
-- ⚠️ THIS IS NOT time_tbd AND MUST NEVER BE MERGED WITH IT. A future session
-- will look at these two booleans and want one. `time_tbd` means THE DAY IS
-- KNOWN AND THE TIME IS NOT DECIDED YET, and the calendar feed prints
-- "Kick-off time to be confirmed" into every subscribed parent's calendar for
-- it. `all_day` means THERE IS NO CLOCK TIME. Collapsing them would put that
-- sentence on a kit collection, which is a false statement, not an approximate
-- one. Same ruling as 20260814_competition_tbd_and_time_tbd.sql: "not decided
-- yet" and "not applicable" are different answers and both must be sayable.
--
-- ⚠️ THE CHECK CONSTRAINT IS THE GUARANTEE. The form's three-way control makes
-- the illegal combination unreachable through the UI, but the UI is not a
-- boundary. Without the constraint a row could claim both states at once and
-- the feed's all-day branch would have to guess which sentence to print.
--
-- ⚠️ NOT NULL WITH A DEFAULT, for the same load-bearing reason as info_only:
-- chat's fixture-thread insert path carries event_id and names neither column.
-- Step 2 of the harness asserts an insert omitting it still works.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing row genuinely has a clock time or is
-- explicitly time_tbd. Guessing that an event stored at midnight "must be
-- all-day" is exactly the heuristic 20260814 refused, and it would be wrong for
-- any fixture legitimately kicking off at 00:00.
--
-- ⚠️ A ONE-DAY ALL-DAY EVENT LEAVES ends_at NULL, AND THAT IS ALREADY ENFORCED
-- by the existing events_ends_after_starts (`ends_at IS NULL OR ends_at >
-- starts_at`) — a same-midnight end is refused by it. No second constraint is
-- added to say the same thing; step 6 of the harness asserts the existing one
-- covers it, so relaxing that check fails loudly here.
--
-- ⚠️ NO GRANT NEEDED. `events` is granted ALL at TABLE level, not
-- column-scoped, so a new column inherits (db/schema/grants.sql).

alter table public.events
  add column if not exists all_day boolean not null default false;

comment on column public.events.all_day is
  'There is no clock time: the event lasts the whole day, or several days via ends_at. NOT the same as time_tbd, which means the time is not decided yet — the calendar feed says "Kick-off time to be confirmed" for that and must not for this.';

-- ⚠️ NOT VALID IS DELIBERATELY *NOT* USED. Every existing row has all_day false
-- by the default above, so the constraint is satisfiable immediately and a
-- validating add cannot fail. Deferring validation would leave a window in
-- which the impossible state is storable.
alter table public.events
  drop constraint if exists events_not_all_day_and_time_tbd;

alter table public.events
  add constraint events_not_all_day_and_time_tbd
  check (not (all_day and time_tbd));

-- ── Assert it landed, column AND constraint ───────────────────────────────
--
-- ⚠️ BOTH HALVES. A column that arrived without its constraint is the shape of
-- a half-applied migration, and every "the column exists" assertion would still
-- pass while the impossible state stayed storable.
do $$
declare col record;
begin
  select data_type, is_nullable, column_default into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'all_day';

  if col is null
     or col.data_type <> 'boolean'
     or col.is_nullable <> 'NO'
     or col.column_default is distinct from 'false' then
    raise exception 'events.all_day did not land as specified: %', col;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_not_all_day_and_time_tbd'
  ) then
    raise exception 'events_not_all_day_and_time_tbd is missing — the impossible state is still storable';
  end if;
end $$;
