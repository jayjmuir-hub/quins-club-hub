-- Forward or back, before anybody decides which forward.
-- Jay, 14 Aug 2026: "we also need to be able to designate players as forwards or
-- back and then later on we will drill that down to specific positions with the
-- option to add multiple positions".
--
-- ⚠️ WHY A COLUMN AND NOT JUST `position`. src/screens/Roster.jsx ALREADY groups
-- into Forwards and Backs — but it DERIVES that from `players.position`, so the
-- grouping only exists once somebody has named a specific position. A nine-year
-- -old can be plainly a forward months before anyone decides between prop and
-- lock, and today that player falls into "Other".
--
-- ⚠️ AUTHORITATIVE WHERE THE TWO DISAGREE — Jay's explicit choice (14 Aug 2026)
-- between two options put to him. A player marked `back` whose position says
-- "Flanker" is A DATA ERROR FOR A HUMAN TO FIX, not something the app silently
-- reconciles. The alternative — deriving unit from position — was rejected
-- because it cannot express "forward, position not decided", which is the entire
-- reason this column exists.
--
-- ⚠️ NOT SENSITIVE, unlike the A/B/C ability tier discussed the same day. This is
-- the same class of information as `position`, which parents already read on the
-- roster. The tier is a judgement about a child's ABILITY and must be coach-only,
-- which RLS cannot do for a column on `players` — see
-- claude/plans/2026-08-14-tiers-and-game-time.md. Do not put the tier here.
--
-- ⚠️ NO POLICY OR GRANT CHANGE NEEDED, and it is worth saying why rather than
-- leaving it to be re-derived: `player edit` is FOR ALL USING
-- private.can_edit_team, so only a coach or admin can write this; `player read`
-- already lets a squad read the row. `players` uses TABLE-level grants with no
-- column list, so a new column is covered — unlike `announcements`, where a new
-- column would NOT be.
alter table public.players
  add column if not exists unit text;

alter table public.players
  drop constraint if exists players_unit_check;

alter table public.players
  add constraint players_unit_check
  check (unit is null or unit in ('forward', 'back'));

comment on column public.players.unit is
  'forward | back, or NULL when nobody has decided. The COARSE designation, set '
  'by a coach, and it is AUTHORITATIVE: where it disagrees with the bucket that '
  'players.position falls into, the unit wins and the mismatch is a data error '
  'for a human to fix, not something the app reconciles (Jay, 14 Aug 2026). It '
  'exists because a player can be known to be a forward long before anyone '
  'decides which forward - which a position column alone cannot express. NOT '
  'sensitive: this is the same class of information as position, which parents '
  'already read on the roster, unlike the A/B/C ability tier which must be '
  'coach-only and therefore needs its own table.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='players' and column_name='unit'
  ) then
    raise exception 'FAILED: players.unit was not created';
  end if;
  raise notice 'guard passed: players.unit exists';
end $$;
