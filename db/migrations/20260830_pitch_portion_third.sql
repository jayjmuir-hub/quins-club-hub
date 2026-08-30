-- Pitch portions: add a THIRD to the vocabulary.
--
-- WHY. The portion picker offered a quarter, a half and a full pitch (and NULL
-- meaning a whole one) — see 20260829_pitch_portion.sql. Jay, 30 Aug 2026: three
-- squads sharing one pitch each take a third, and there was no way to say so —
-- a third had to be rounded to a quarter or a half, which then mis-reads as a
-- clash or as free space. `third` = 1/3 joins the set; src/lib/pitchPortion.js
-- carries the fraction, and src/data/pitches.js already sums with an EPSILON so
-- three thirds (0.999…) read as one whole pitch rather than an over-capacity
-- clash.
--
-- ⚠️ WIDENING ONLY, so it is safe against every existing row: no row holds
-- 'third' today, and adding a value a CHECK admits cannot make an existing row
-- violate it. The value set is still pinned so a typo cannot reach the column.
--
-- ⚠️ THE CONSTRAINT IS UNNAMED IN THE ORIGINAL MIGRATION, so Postgres named it
-- `events_pitch_portion_check` (confirmed live, 30 Aug 2026). A CHECK cannot be
-- edited in place, so drop and recreate — `if exists` keeps this re-runnable.
--
-- ⚠️ ORDERING: apply this BEFORE the code that offers 'third' deploys. The
-- reverse of a destructive change — here the DB must ACCEPT the new value before
-- the UI can write it, or a save of a third fails the CHECK.

alter table public.events
  drop constraint if exists events_pitch_portion_check;

alter table public.events
  add constraint events_pitch_portion_check
    check (pitch_portion in ('quarter', 'third', 'half', 'full'));
