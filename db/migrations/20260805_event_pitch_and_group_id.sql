-- Applied to Supabase as migration 20260805... "events_pitch_and_group_id".
--
-- Two additive, nullable columns on public.events. No RLS change: both
-- policies ("event read", "event edit") key off team_id, which is untouched,
-- so nothing here widens or narrows who can read or write a row.

-- Which pitch the match or training is on, within the venue. Free text, like
-- venue itself -- there is no pitches table and this deliberately does not
-- create one. A managed list with clash detection was considered and not
-- chosen; see claude/plan-multi-squad-and-pitch.md.
alter table public.events add column if not exists pitch text;

-- One id shared by the rows created together when an admin picks several age
-- groups for the same session. Exactly the shape of series_id, and for the
-- same reason: each squad still gets its own independent event row -- so RLS,
-- availability, the calendar feed and the schedule all keep working
-- unchanged -- while the id makes "edit or cancel every squad for this
-- session" addable later without another migration.
--
-- group_id and series_id are deliberately never both set on one row: a
-- multi-squad event cannot repeat and a repeating event is one squad. The
-- form refuses that combination at submit time rather than silently
-- multiplying rows (15 squads x a term of Tuesdays is ~1,500 rows from one
-- submission). That refusal is a UI guard, not a database constraint -- it is
-- about volume, not correctness, and a constraint here would be a trap for
-- any future backfill.
alter table public.events add column if not exists group_id uuid;

create index if not exists events_group_id_idx
  on public.events (group_id)
  where group_id is not null;
