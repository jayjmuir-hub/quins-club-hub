-- ══════════════════════════════════════════════════════════════════════════
--  events.info_only — Club Diary, phase 1
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/plans/2026-08-31-club-diary.md
-- Plan:    claude/plans/2026-08-31-club-diary-implementation.md
-- Harness: db/tests/club-diary.sql (written FIRST and watched failing)
--
-- WHAT THIS IS FOR. A dated item with nothing to RSVP to — a kit collection, a
-- shop opening, a ball collection. Four of the seven lines on the club's own
-- "3 week look ahead" poster are exactly this. Before today they could only be
-- filed as a Social, which produces a fixture carrying an availability list
-- nobody will ever fill in, or as a Notice, which has NO DATE COLUMN AT ALL and
-- therefore cannot reach a subscribed calendar.
--
-- ⚠️ THIS IS DELIBERATELY NOT A FOURTH events.type, AND THE REASON IS THE WHOLE
-- DESIGN. `type` is read by the calendar feed, EVENT_TYPE_ICONS, the chip and
-- detail marks, nextEventLabel, and the filters on Schedule, Dashboard and
-- SocialWhatsOn. Every one of those branches on three known values, so a fourth
-- would fall through each of them SILENTLY — no error, just a missing icon, a
-- missing filter row and a mislabelled calendar entry. A Club Diary entry is
-- `type = 'social'` with this flag set, which is the same shape a tournament
-- already uses (`type = 'match'`, `competition_type = 'tournament'`).
--
-- ⚠️ THE COST OF THAT CHOICE, STATED SO NOBODY HAS TO REDISCOVER IT: two
-- different things now share `type = 'social'`, so any code reading `type`
-- alone conflates a Welcome Back Party with a kit collection. The app answers
-- that with eventChipKind() in src/lib/eventFormat.js. The alternative failed
-- INVISIBLY, which is why it lost.
--
-- ⚠️ NOT NULL WITH A DEFAULT, AND THE DEFAULT IS LOAD-BEARING BEYOND TIDINESS.
-- Chat's fixture-thread insert path carries event_id and inserts without naming
-- this column; a NOT NULL column with no default would break it, and it would
-- break in chat rather than here. db/tests/club-diary.sql step 2 asserts that
-- an insert omitting this column still works, so the safety is measured rather
-- than assumed.
--
-- ⚠️ NOTHING IS BACKFILLED, ON PURPOSE. Every existing row is correctly false:
-- none of them was created as information-only, and flipping an old social
-- would HIDE replies people have already given rather than delete them, which
-- is the one outcome this feature's own rules forbid everywhere else.
--
-- ⚠️ NO GRANT IS NEEDED AND NONE IS ADDED. db/schema/grants.sql records
-- `events` as granted ALL at TABLE level to anon, authenticated, postgres and
-- service_role — not column-scoped — so a new column inherits. Adding a grant
-- here would be noise that `docs:check` rule 7 would then require to be
-- captured.
--
-- ⚠️ AVAILABILITY IS NOT CONSTRAINED AGAINST THIS FLAG, DELIBERATELY. The
-- suppression is a UI decision. Rows that already exist when somebody
-- reclassifies a social must survive — the form REFUSES that toggle rather than
-- orphaning or deleting them, because orphaning hides data that still exists
-- and deleting destroys a coach's answer. Refusing is the only outcome that
-- cannot lose information.

alter table public.events
  add column if not exists info_only boolean not null default false;

comment on column public.events.info_only is
  'Club Diary: a dated item with nothing to RSVP to (kit collection, shop opening). Suppresses the availability UI; the calendar feed exports it like any other event. NOT a type — a Club Diary entry is type=social with this set.';

-- ── Assert the column landed exactly as specified ──────────────────────────
--
-- ⚠️ A PARTIALLY-APPLIED MIGRATION MUST FAIL HERE, NOT IN THE APP. Same
-- reasoning as the pg_get_function_result assertion in
-- db/migrations/20260814_calendar_feed_competition_type.sql: the failure mode
-- worth catching is the one that leaves the database looking fine.
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
    raise exception 'events.info_only was not created';
  end if;
  if col.data_type <> 'boolean'
     or col.is_nullable <> 'NO'
     or col.column_default is distinct from 'false' then
    raise exception
      'events.info_only did not land as specified: type=%, nullable=%, default=%',
      col.data_type, col.is_nullable, col.column_default;
  end if;
end $$;
