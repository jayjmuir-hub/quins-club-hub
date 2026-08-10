-- ══════════════════════════════════════════════════════════════════════════
--  A managed pitch list
--  11 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THIS OVERTURNS A DELIBERATE DECISION. `2026-08-05-multi-squad-events-and-pitch.md`
-- chose free text, in as many words:
--
--     What is a pitch? → Free text beside Venue. No pitches table, no clash
--     detection.
--
-- That was a scope call for the MVP and it was the right one at the time: with
-- one person entering fixtures, a table would have been ceremony. It is
-- overturned because Tracy's job IS pitch allocation, and because the free
-- text has already drifted exactly as free text does. Measured 11 Aug 2026:
--
--     Pitch TBD   26     Pitch 3    2     Pitch 1   1
--     Pitch 2      9     Pitch 7    1     Pitch 4   1
--     Pitch D2     6     Pitch 5    1     Clubhouse lawn   1
--
-- "Pitch 2" and "Pitch D2" are two spellings of a question nobody can answer
-- from the data, and no clash detector can group by a string somebody retyped.
--
-- ⚠️ `events.pitch` STAYS TEXT. NO FOREIGN KEY. This is the part most likely
-- to be "tidied" later, so the reasons are here:
--
--   1. `Pitch TBD` IS NOT A PITCH. It is the deliberate placeholder Jay ruled
--      must keep rendering — without it nobody can tell "no pitch allocated
--      yet" from "the app didn't say". It is 26 of the 48 rows. A foreign key
--      would need it to become either a real pitch row (a lie) or NULL (which
--      loses the distinction the ruling exists to preserve).
--   2. Every existing row would need migrating, including "Clubhouse lawn",
--      which is a venue somebody typed into a pitch box and is not wrong.
--   3. The list is a PICKER SOURCE, not a constraint. Its job is to stop new
--      drift, not to relitigate old rows.
--
-- So: the picker writes `pitches.name` into `events.pitch`, and clash
-- detection groups on that text. If the club ever wants strictness, the
-- migration is a later decision with its own harness — not a side effect of
-- adding a list.

create table if not exists public.pitches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  -- ⚠️ RETIRED, NOT DELETED. A pitch that closes for resurfacing must stop
  -- appearing in the picker WITHOUT rewriting the fixtures that already name
  -- it — deleting the row would leave last season's events pointing at a
  -- pitch nobody can look up, and `events.pitch` is text so nothing would
  -- even complain.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- One spelling per club. This is the whole point of the table: it is the
  -- constraint free text could not carry.
  unique (club_id, name)
);

alter table public.pitches enable row level security;

-- ⚠️ RLS ON FROM THE SAME MIGRATION THAT CREATES THE TABLE, deliberately.
-- Supabase's default privileges give `anon` full rights on every new table in
-- `public`, so a table created without RLS is not "unhardened" — it is open
-- to anyone holding the project URL, and nothing in the `create table` says
-- so. db/tests/grants.sql asserts every table has it.

-- Anyone signed in and attached to the club can READ the list: a parent sees
-- "Pitch 2" on a fixture and the name has to mean something. Pitch names are
-- not sensitive.
drop policy if exists "pitch read" on public.pitches;
create policy "pitch read" on public.pitches
  for select using (auth.uid() is not null);

-- ⚠️ WRITES ARE ADMIN-ONLY, NOT `pitches`-RIGHT-ONLY, AND THAT IS NOT AN
-- OVERSIGHT. The admin RIGHTS added 10 Aug gate SCREENS, not data — every
-- admin already sees and edits everything, and the rights exist to decide
-- which dashboard appears. Enforcing `admin_rights` here would make it the
-- first right that is a real permission, which is a different decision with
-- different consequences (see claude/decisions/2026-08-10-role-dashboards.md).
-- The Pitch Manager right decides who is SHOWN the pitch screen.
drop policy if exists "pitch manage" on public.pitches;
create policy "pitch manage" on public.pitches
  for all
  using (private.is_admin(club_id))
  with check (private.is_admin(club_id));

create index if not exists pitches_club_sort_idx
  on public.pitches (club_id, sort_order, name);

-- ── Seed from what is already in use ──────────────────────────────────────
--
-- ⚠️ `Pitch TBD` IS DELIBERATELY EXCLUDED — it is the placeholder, not a
-- pitch, and putting it in the list would offer it as a choice alongside real
-- ones. The form keeps it as its own "not allocated yet" option.
--
-- Sort order follows the trailing number where there is one, so "Pitch 1" to
-- "Pitch 7" list in the order a human would write them rather than
-- alphabetically, where "Pitch 10" sorts before "Pitch 2".
insert into public.pitches (club_id, name, sort_order)
select distinct e.club_id,
       e.pitch,
       coalesce(nullif(regexp_replace(e.pitch, '\D', '', 'g'), '')::int, 999)
from public.events e
where e.pitch is not null
  and btrim(e.pitch) <> ''
  and e.pitch <> 'Pitch TBD'
on conflict (club_id, name) do nothing;
