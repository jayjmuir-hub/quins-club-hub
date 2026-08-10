-- ══════════════════════════════════════════════════════════════════════════
--  The club's REAL pitches: A1-A4, B1, C1-C5, D1-D5
--  11 Aug 2026 — Jay
-- ══════════════════════════════════════════════════════════════════════════
--
-- The list seeded hours earlier by `20260811_pitches.sql` was derived from
-- whatever text was already in `events.pitch`, and that text turned out to be
-- almost entirely SEED DATA rather than the club's pitches. Measured before
-- this migration:
--
--     Pitch 2   9 uses    ALL 9 from the seeded September
--     Pitch 3   2 uses    both from the seed
--     Pitch 1/4/5/7, Clubhouse lawn   1 each, ALL from the seed
--     Pitch D2  6 uses    NONE from the seed  ← real
--
-- So sixteen of the twenty-two allocations were fixtures nobody at the club
-- ever played, and the pitch list built from them was a list of nothing.
-- ⚠️ **A list seeded from data is only as real as the data.** The seeding was
-- the right shape and the wrong source, and it was only caught because Jay
-- read the list and said what the pitches actually are.
--
-- ⚠️ THE SEEDED ROWS ARE DELETED, NOT RETIRED, and that is a deliberate
-- exception to this table's own rule. `is_active` exists so a pitch closed for
-- resurfacing stops appearing in the picker WITHOUT orphaning the fixtures
-- that name it. That reasoning protects pitches which were once real. These
-- never were: retiring them would leave eight fictional pitches in the
-- management screen forever, each needing a paragraph explaining why it is
-- there.
--
-- ⚠️ `Pitch D2` IS REMAPPED, AND IT IS THE ONLY ONE. Six real events carry it,
-- none from the seed, and it unambiguously means D2 under the club's scheme.
-- The rest are left alone: they belong to the seeded September, which
-- `claude/state-of-play.md` records is to be deleted before a pilot, and
-- rewriting fixtures that are about to be thrown away would be work performed
-- on rubbish.
--
-- ⚠️ SORT ORDER LEAVES GAPS BETWEEN THE LETTER BLOCKS (1-3, 11, 21-24, 31-35)
-- so a B2 or a C5 can be inserted later in the right place without renumbering
-- the whole list. Alphabetical ordering would put A1, A2, A3, B1, C1... in the
-- right order today and break the moment a pitch is named A10.

-- Out with the fictional list.
delete from public.pitches
where name in ('Pitch 1','Pitch 2','Pitch 3','Pitch 4','Pitch 5','Pitch 7',
               'Pitch D2','Clubhouse lawn');

-- In with the real one.
-- ⚠️ APPLIED IN TWO STEPS, and the file shows the END STATE. Jay's first
-- message said A1-A3 and C1-C4; minutes later, "sorry a1-4 and c1-5". Live
-- therefore has migrations `real_pitch_names` (13 rows) and
-- `real_pitch_names_a4_c5` (the two extra). A replay of THIS file produces the
-- correct fifteen in one go, which is what a replay is for — but Supabase's
-- own migration list is the authority on what actually ran, per
-- claude/schema-history.md.
insert into public.pitches (club_id, name, sort_order)
select c.id, v.name, v.sort_order
from public.clubs c
cross join (values
  ('A1', 1), ('A2', 2), ('A3', 3), ('A4', 4),
  ('B1', 11),
  ('C1', 21), ('C2', 22), ('C3', 23), ('C4', 24), ('C5', 25),
  ('D1', 31), ('D2', 32), ('D3', 33), ('D4', 34), ('D5', 35)
) as v(name, sort_order)
on conflict (club_id, name) do nothing;

-- The one real correction. Six events, none from the seed.
update public.events
   set pitch = 'D2'
 where pitch = 'Pitch D2';
