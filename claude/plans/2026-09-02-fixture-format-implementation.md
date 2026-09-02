# Fixture Format Implementation Plan

**Status: NOT SHIPPED — implementation plan for `claude/plans/2026-09-02-fixture-format.md`, being executed.** Dated 2026-09-02.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fixture knows whether it is 7s, 10s, 12s or 15s, and the match sheet, lineup and schedule follow it, so a U18 10s tournament game stops getting a 22-slot sheet.

**Architecture:** One nullable `events.format` column (null reads as 15 everywhere, so every existing row behaves as today) and one nullable `teams.default_format`. A pure lib, `src/lib/fixtureFormat.js`, is the only place the slot/replacement/squad-max table lives; every screen imports it. The event form writes the column, forcing 15 on a league match; the match sheet and lineup read it; the schedule chip and event detail show it only when it is not 15.

**Tech Stack:** Vite + React, Tailwind, Supabase Postgres 17, vitest with `@testing-library/react`. Migrations are SQL files in `db/migrations/`, applied to live through the Supabase MCP `apply_migration` after Jay's yes; harnesses in `db/tests/` run against production inside a transaction that rolls back (`npm run db:check -- <name>`, see `claude/runbooks/db-harnesses.md`).

## Global Constraints

- **Never `git add -A`.** Stage explicit paths. Never commit `package.json` changes.
- **`main` is production.** Work on branch `claude/fixture-format`; open a pull request; Jay merges. A deploy costs 15 Netlify credits; the reason to avoid a pointless one is tidiness.
- **No real person's name anywhere in the repo**, tests and harness comments included. Invent names; keep the shape.
- **Every new assertion is proven against an injected fault** before it is trusted (rule 6). Every negative assertion carries a control that proves the matcher can find something.
- **Format values are exactly `7 | 10 | 12 | 15`.** Null means "not stated" and reads as 15. A league match (`competition_type = 'league'`) is always 15.
- **Minis are untouched.** U10 and below (`isMinisTeam` in `src/lib/minis.js`) are never offered the control.
- **Use `npm run test:related -- <file>` while editing, `npm test` before pushing.** The full suite is ~40s.
- **Run `npm run docs:check` after touching anything under `claude/`** and again after the commit.
- **Changelog:** add the entry in the same commit as the change, without a SHA for this branch's own commits (the squash SHA is cited by the NEXT pull request).
- **The migration is applied to live only with Jay's explicit yes**, and the harness must be green against production before the pull request is opened.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/fixtureFormat.js` (create) | The format table: `FORMATS`, `formatOf(event)`, `sheetSlots(format)`, `replacements(format)`, `squadMax(format)`, `formatLabel(format)`. Pure, no React. |
| `tests/fixture-format.test.js` (create) | The table both ways, null-reads-as-15 with a control. |
| `db/migrations/20260902_fixture_format.sql` (create) | `events.format`, `teams.default_format`, CHECKs, the league-is-15 CHECK. |
| `db/tests/fixture-format.sql` (create) | Harness: columns exist, CHECK refuses 9, refuses a 7s league row, accepts a 7s tournament. Rolls back. |
| `db/schema/tables.sql` (modify) | Capture the two columns and three constraints, in the same style as `league_team_tbd`. |
| `src/data/teams.js` (modify) | `setTeamDefaultFormat(teamId, format)`. |
| `src/screens/EventForm.jsx` (modify) | `values.format`, the segmented control, the payload rule. |
| `tests/event-form-format.test.jsx` (create) | League hides and writes 15; tournament shows and writes the pick; minis shows nothing; default from squad. |
| `src/lib/eventFormat.js` (modify) | nothing — `formatLabel` lives in `fixtureFormat.js` to keep this file's test file untouched. |
| `src/components/ScheduleTable.jsx`, `src/screens/EventDetail.jsx` (modify) | Show the format only when it is not 15. |
| `tests/scheduleTable.test.jsx`, `tests/event-detail-format.test.jsx` (modify / create) | The "only when not 15" rule with its control. |
| `src/data/matchSheets.js` (modify) | `SLOT_COUNT` stays as the 15s maximum; the sheet no longer uses it for sizing. |
| `src/screens/MatchSheet.jsx` (modify) | Slot count from the fixture; extras beyond the format kept and labelled. |
| `tests/match-sheet-format.test.jsx` (create) | 10s renders 15 slots, null renders 22, saved extras survive. |
| `src/screens/Lineup.jsx` (modify) | `perSide` defaults from the fixture's format when there is no lineup yet. |
| `tests/lineup-format-default.test.jsx` (create) | New lineup on a 7s fixture opens at 7-a-side; existing lineup keeps its own. |
| `src/screens/AdminClub.jsx` (modify) | "Usual tournament format" select in the per-squad scoring sheet. |
| `tests/admin-club-scoring.test.jsx` (modify) | The select saves through `setTeamDefaultFormat`. |
| `claude/changelog.md`, `RESTORE.md`, `claude/plans/2026-09-02-fixture-format.md` (modify) | Entry, the "22 slots" fact corrected, status line. |

---

### Task 1: The format lib

**Files:**
- Create: `src/lib/fixtureFormat.js`
- Test: `tests/fixture-format.test.js`

**Interfaces:**
- Produces: `FORMATS = [7, 10, 12, 15]`, `DEFAULT_FORMAT = 15`, `formatOf(event) -> 7|10|12|15`, `sheetSlots(format) -> number`, `replacements(format) -> number`, `squadMax(format) -> number`, `formatLabel(format) -> '7s'|'10s'|'12s'|'15s'`, `isFormat(value) -> boolean`. Every later task imports from here and nowhere else.

- [ ] **Step 1: Write the failing test**

```js
// tests/fixture-format.test.js
// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FORMAT,
  FORMATS,
  formatLabel,
  formatOf,
  isFormat,
  replacements,
  sheetSlots,
  squadMax,
} from '../src/lib/fixtureFormat.js'

// Format on the fixture (claude/plans/2026-09-02-fixture-format.md). The
// numbers are the RCM/UAERF 2025-26 law variations' squad maxima: 7s 12,
// 10s 15, 12s 18, 15s 22. This file is the ONLY home for them.

describe('fixtureFormat', () => {
  it('knows exactly the four formats the club plays', () => {
    expect(FORMATS).toEqual([7, 10, 12, 15])
    expect(DEFAULT_FORMAT).toBe(15)
    expect(isFormat(10)).toBe(true)
    // CONTROL: a plausible wrong number is refused, so the positive above is
    // not "everything passes".
    expect(isFormat(9)).toBe(false)
    expect(isFormat('15')).toBe(false)
    expect(isFormat(null)).toBe(false)
  })

  it('maps every format to its sheet slots, replacements and squad max', () => {
    expect([7, 10, 12, 15].map(sheetSlots)).toEqual([12, 15, 18, 22])
    expect([7, 10, 12, 15].map(replacements)).toEqual([5, 5, 6, 7])
    expect([7, 10, 12, 15].map(squadMax)).toEqual([12, 15, 18, 22])
    // Sheet slots equal squad max by definition — if these ever diverge the
    // sheet is lying about how many players may be named.
    for (const f of [7, 10, 12, 15]) expect(sheetSlots(f)).toBe(squadMax(f))
  })

  it('reads a missing or null format as 15, and a stated one as itself', () => {
    expect(formatOf({})).toBe(15)
    expect(formatOf({ format: null })).toBe(15)
    expect(formatOf(null)).toBe(15)
    // CONTROL: a stated 7 does NOT read as 15 — the fallback is for absence
    // only.
    expect(formatOf({ format: 7 })).toBe(7)
    // A value the database could never hold still degrades to 15 rather than
    // to a sheet with an impossible size.
    expect(formatOf({ format: 9 })).toBe(15)
  })

  it('labels formats the way the club says them', () => {
    expect([7, 10, 12, 15].map(formatLabel)).toEqual(['7s', '10s', '12s', '15s'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/fixture-format.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/fixtureFormat.js"`.

- [ ] **Step 3: Write the lib**

```js
// src/lib/fixtureFormat.js
// What format a fixture is played in — 7s, 10s, 12s or 15s — and what follows
// from it. claude/plans/2026-09-02-fixture-format.md.
//
// ⚠️ THE FORMAT IS A PROPERTY OF THE FIXTURE, NOT THE SQUAD. A squad plays
// 15s on Friday and a 7s tournament the next weekend (Jay, 2 Sep 2026). The
// RCM/UAERF 2025-26 law variations give U18 three formats at tournaments, so
// deriving it from the age group would be wrong exactly when it matters.
//
// ⚠️ THIS FILE IS THE ONLY HOME FOR THESE NUMBERS. The match sheet, the
// lineup and the availability count all import them; none of them may hold a
// literal 22 for sizing any more. (src/data/matchSheets.js keeps SLOT_COUNT
// as the 15s MAXIMUM for the stored-slot bound — the biggest a sheet can be —
// not as the size of any particular sheet.)
//
// ⚠️ NULL READS AS 15, ON PURPOSE. Every fixture created before this column
// existed has no format, and every one of them was a 15s fixture as far as
// the sheet was concerned. Reading null as 15 keeps each of them exactly as
// it was. A league match is ALWAYS 15 — the event form writes it and a CHECK
// in the database refuses anything else on a league row.
//
// Pure, no React — the same rule scoring.js and minis.js follow, for the same
// reason: read by several screens and by tests that must not build a DOM.

/** The formats the club plays, smallest first. Order is the order the form offers them. */
export const FORMATS = Object.freeze([7, 10, 12, 15])

/** What a fixture with no stated format is. */
export const DEFAULT_FORMAT = 15

// Squad maximum per format, straight from the law variations table:
// 7s 12, 10s 15, 12s 18, 15s 22. Sheet slots EQUAL squad max — the sheet
// names everyone who may take the field.
const SQUAD_MAX = Object.freeze({ 7: 12, 10: 15, 12: 18, 15: 22 })

// Replacements per format: squad max minus players on the pitch.
const REPLACEMENTS = Object.freeze({ 7: 5, 10: 5, 12: 6, 15: 7 })

/** True for exactly the four numbers the database CHECK admits. */
export function isFormat(value) {
  return typeof value === 'number' && FORMATS.includes(value)
}

/** The fixture's format, with null and anything unrecognised reading as 15. */
export function formatOf(event) {
  const value = event?.format
  return isFormat(value) ? value : DEFAULT_FORMAT
}

/** How many named slots the match sheet has for this format. */
export function sheetSlots(format) {
  return SQUAD_MAX[isFormat(format) ? format : DEFAULT_FORMAT]
}

/** How many replacements the format allows. */
export function replacements(format) {
  return REPLACEMENTS[isFormat(format) ? format : DEFAULT_FORMAT]
}

/** The largest squad the format allows to be named. */
export function squadMax(format) {
  return SQUAD_MAX[isFormat(format) ? format : DEFAULT_FORMAT]
}

/** "7s", "15s" — the way the club says it. */
export function formatLabel(format) {
  return `${isFormat(format) ? format : DEFAULT_FORMAT}s`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run tests/fixture-format.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Prove one assertion against an injected fault**

Temporarily change `10: 15` to `10: 16` in `SQUAD_MAX`, run the test, confirm the "maps every format" test FAILS, then put it back and confirm PASS. This is rule 6; do not skip it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fixtureFormat.js tests/fixture-format.test.js
git commit -m "feat(format): the fixture-format table — 7s/10s/12s/15s and what follows from each"
```

---

### Task 2: The migration and its harness

**Files:**
- Create: `db/migrations/20260902_fixture_format.sql`
- Create: `db/tests/fixture-format.sql`
- Modify: `db/schema/tables.sql` (events block near line 787; teams block near line 146)

**Interfaces:**
- Produces: `events.format smallint NULL CHECK in (7,10,12,15)`, `events_league_is_fifteen CHECK`, `teams.default_format smallint NULL CHECK in (7,10,12,15)`. Every later task's SQL and payloads use exactly these names.

- [ ] **Step 1: Write the harness first (it fails until the migration is applied — that is the point)**

```sql
-- db/tests/fixture-format.sql
-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — fixture format: events.format, teams.default_format, and the
--  rule that a league match is always 15s.
--  Paste into the Supabase SQL editor, or run `npm run db:check -- fixture-format`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260902_fixture_format.sql. Written BEFORE the
-- migration is applied (it fails until it is — that is the point).
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children.

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

-- ── STEP 1 — both columns exist, smallint, nullable ───────────────────────
do $$
declare col record;
begin
  select data_type, is_nullable into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'format';
  if col is null then raise exception 'events.format is missing'; end if;
  if col.data_type <> 'smallint' or col.is_nullable <> 'YES' then
    raise exception 'events.format is % nullable=% — expected smallint, nullable', col.data_type, col.is_nullable;
  end if;

  select data_type, is_nullable into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'teams' and column_name = 'default_format';
  if col is null then raise exception 'teams.default_format is missing'; end if;
  if col.data_type <> 'smallint' or col.is_nullable <> 'YES' then
    raise exception 'teams.default_format is % nullable=% — expected smallint, nullable', col.data_type, col.is_nullable;
  end if;
  raise notice 'STEP 1 ok: both columns exist';
end $$;

-- ── STEP 2 — a fixture to test against, on an invented squad ──────────────
-- Uses the first club and creates its own squad so nothing real is touched.
create temporary table _fx on commit drop as
  select c.id as club_id from public.clubs c order by c.created_at limit 1;

insert into public.teams (club_id, name, sort_order)
select club_id, 'Harness U18 Format', 999 from _fx;

create temporary table _team on commit drop as
  select id from public.teams where name = 'Harness U18 Format';

-- ── STEP 3 — the CHECK refuses 9 ─────────────────────────────────────────
do $$
begin
  insert into public.events (club_id, team_id, type, title, starts_at, format)
  select f.club_id, t.id, 'match', 'Harness 9s', now() + interval '7 days', 9 from _fx f, _team t;
  raise exception 'STEP 3 FAILED: events.format accepted 9';
exception
  when check_violation then raise notice 'STEP 3 ok: 9 refused';
end $$;

-- ── STEP 4 — a 7s LEAGUE row is refused ──────────────────────────────────
do $$
begin
  insert into public.events (club_id, team_id, type, title, starts_at, competition_type, format)
  select f.club_id, t.id, 'match', 'Harness league 7s', now() + interval '7 days', 'league', 7 from _fx f, _team t;
  raise exception 'STEP 4 FAILED: a league match accepted format 7';
exception
  when check_violation then raise notice 'STEP 4 ok: league 7s refused';
end $$;

-- ── STEP 5 — CONTROL: a 7s TOURNAMENT row is accepted, and a 15 league row is ─
-- Without this, STEPS 3 and 4 could pass because the whole INSERT is broken.
insert into public.events (club_id, team_id, type, title, starts_at, competition_type, format)
select f.club_id, t.id, 'match', 'Harness tournament 7s', now() + interval '7 days', 'tournament', 7 from _fx f, _team t;
insert into public.events (club_id, team_id, type, title, starts_at, competition_type, format)
select f.club_id, t.id, 'match', 'Harness league 15s', now() + interval '7 days', 'league', 15 from _fx f, _team t;
-- And a league row with NO format is still fine — null reads as 15 in the app.
insert into public.events (club_id, team_id, type, title, starts_at, competition_type)
select f.club_id, t.id, 'match', 'Harness league null', now() + interval '7 days', 'league' from _fx f, _team t;
do $$
declare n int;
begin
  select count(*) into n from public.events where title like 'Harness %';
  if n <> 3 then raise exception 'STEP 5 FAILED: expected 3 harness rows, found %', n; end if;
  raise notice 'STEP 5 ok: tournament 7s, league 15 and league null all accepted';
end $$;

-- ── STEP 6 — teams.default_format takes 12 and refuses 11 ────────────────
update public.teams set default_format = 12 where id in (select id from _team);
do $$
begin
  update public.teams set default_format = 11 where id in (select id from _team);
  raise exception 'STEP 6 FAILED: teams.default_format accepted 11';
exception
  when check_violation then raise notice 'STEP 6 ok: 11 refused, 12 accepted';
end $$;

rollback;
```

- [ ] **Step 2: Run the harness to verify it fails**

Run: `npm run db:check -- fixture-format`
Expected: FAIL at STEP 1 with `events.format is missing`. (If it fails at STEP 0 the runner cannot see the database; read `claude/runbooks/db-harnesses.md` before going further.)

- [ ] **Step 3: Write the migration**

```sql
-- db/migrations/20260902_fixture_format.sql
-- ══════════════════════════════════════════════════════════════════════════
--  Fixture format — 7s, 10s, 12s or 15s, on the FIXTURE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 2 Sep 2026: "all the age groups that play league play 15's, but
-- sometimes tournaments are 10, 12, or 15 or even 7's." The RCM/UAERF
-- 2025-26 law variations confirm it and add the fact the app gets wrong
-- today: U18 Boys and Girls play 10s, 12s or 15s at tournaments with a
-- squad max of 15, 18 or 22 — and the match sheet has 22 fixed slots.
-- claude/plans/2026-09-02-fixture-format.md.
--
-- ⚠️ ON events, NOT teams. A squad plays 15s on Friday and a 7s tournament
-- the next weekend; a format on the squad would be wrong for every
-- tournament. teams.default_format below is only what a NEW tournament or
-- friendly pre-selects.
--
-- ⚠️ NULLABLE, AND NULL MEANS "NOT STATED", WHICH THE APP READS AS 15. Every
-- fixture that exists today was a 15s fixture as far as the sheet knew.
-- Backfilling 15 would record an answer nobody gave; leaving null keeps each
-- of them exactly as it was. Same ruling as competition_type: the migration
-- writes nothing into existing rows.
--
-- ⚠️ A LEAGUE MATCH IS ALWAYS 15, AND THE DATABASE SAYS SO. The form does
-- not ask; this CHECK is what stops a hand-rolled REST call filing a 7s
-- league game. Null is allowed on a league row (it reads as 15).
--
-- ⚠️ MINIS ARE NOT SPECIAL-CASED HERE. U10 and below have their own formats
-- and no match sheet (src/lib/minis.js); the app simply never OFFERS the
-- control on a minis fixture. A constraint on age would have to parse
-- teams.name, which this schema refuses to do anywhere access or data shape
-- is decided.

alter table public.events
  add column if not exists format smallint;

comment on column public.events.format is
  'Players a side: 7, 10, 12 or 15. NULL means not stated and is read as 15 '
  'everywhere. A league match is always 15 (events_league_is_fifteen). '
  'Drives match-sheet slots, replacements and squad max via '
  'src/lib/fixtureFormat.js. claude/plans/2026-09-02-fixture-format.md.';

alter table public.events
  drop constraint if exists events_format_check;
alter table public.events
  add constraint events_format_check
  check (format is null or format in (7, 10, 12, 15));

alter table public.events
  drop constraint if exists events_league_is_fifteen;
alter table public.events
  add constraint events_league_is_fifteen
  check (competition_type is distinct from 'league' or format is null or format = 15);

alter table public.teams
  add column if not exists default_format smallint;

comment on column public.teams.default_format is
  'What a NEW tournament or friendly for this squad pre-selects: 7, 10, 12 '
  'or 15. NULL means 15. Set by an admin on the Club tab. Never read for a '
  'league match, which is always 15.';

alter table public.teams
  drop constraint if exists teams_default_format_check;
alter table public.teams
  add constraint teams_default_format_check
  check (default_format is null or default_format in (7, 10, 12, 15));

-- ── GUARD: the constraints exist, or abort ────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_league_is_fifteen') then
    raise exception 'ABORTING: events_league_is_fifteen was not created.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_default_format_check') then
    raise exception 'ABORTING: teams_default_format_check was not created.';
  end if;
  raise notice 'guard passed: fixture format columns and constraints in place';
end $$;
```

- [ ] **Step 4: Apply the migration to live — ONLY with Jay's yes**

Say to Jay, in the chat: "The fixture-format migration adds two nullable columns and three CHECK constraints, writes nothing into existing rows, and is idempotent. May I apply it to live?" Wait for yes. Then apply it through the Supabase MCP `apply_migration` tool with `name: fixture_format` and the file's contents. Confirm with `list_migrations` that it appears.

- [ ] **Step 5: Run the harness to verify it passes**

Run: `npm run db:check -- fixture-format`
Expected: PASS with notices `STEP 1 ok` through `STEP 6 ok`, and `ROLLBACK` at the end. Then run the WHOLE `npm run db:check` (no filter) — your harness passing says nothing about the ones you may have invalidated.

- [ ] **Step 6: Capture the schema**

In `db/schema/tables.sql`, directly after the `league_team_tbd boolean NOT NULL DEFAULT false,` line in the `events` block, add:

```sql
  -- Added 2026-09-02 (fixture_format). Column comment as stored:
  --   "Players a side: 7, 10, 12 or 15. NULL means not stated and is read as
  --   15 everywhere. A league match is always 15 (events_league_is_fifteen)."
  -- ⚠️ NULL IS NOT BACKFILLED. Every pre-existing fixture reads as 15 through
  -- src/lib/fixtureFormat.js; the migration deliberately wrote nothing.
  format          smallint,
```

In the `events` constraints list (near `events_league_team_not_both`), add:

```sql
  CONSTRAINT events_format_check        CHECK (((format IS NULL) OR (format = ANY (ARRAY[7, 10, 12, 15])))),
  CONSTRAINT events_league_is_fifteen   CHECK (((competition_type IS DISTINCT FROM 'league'::text) OR (format IS NULL) OR (format = 15))),
```

In the `teams` block, after the `self_registration_allowed` column, add:

```sql
  -- Added 2026-09-02 (fixture_format). What a NEW tournament or friendly
  -- pre-selects: 7, 10, 12 or 15. NULL means 15. Never read for a league
  -- match. Admin-edited on the Club tab beside scoring.
  default_format  smallint,
```

and in the `teams` constraints:

```sql
  CONSTRAINT teams_default_format_check CHECK (((default_format IS NULL) OR (default_format = ANY (ARRAY[7, 10, 12, 15])))),
```

Then verify the capture against live: run, through the MCP `execute_sql`,
`select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('events_format_check','events_league_is_fifteen','teams_default_format_check');`
and make the captured text match what Postgres prints.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/20260902_fixture_format.sql db/tests/fixture-format.sql db/schema/tables.sql
git commit -m "feat(format): events.format and teams.default_format, league is always 15 — applied to live 2 Sep 2026"
```

---

### Task 3: The squad default, data layer

**Files:**
- Modify: `src/data/teams.js` (append after `setTeamRequiresContact`)
- Test: `tests/teams-default-format.test.js` (create)

**Interfaces:**
- Produces: `setTeamDefaultFormat(teamId, format)` — `format` is `7|10|12|15|null`; resolves to the updated team row; throws `Error` with a plain sentence when refused.

- [ ] **Step 1: Write the failing test**

```js
// tests/teams-default-format.test.js
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateMock = vi.fn()
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch) => {
        updateMock(patch)
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => updateMock.result,
            }),
          }),
        }
      },
    }),
  },
}))

import { setTeamDefaultFormat } from '../src/data/teams.js'

beforeEach(() => {
  vi.clearAllMocks()
  updateMock.result = { data: { id: 't1', default_format: 7 }, error: null }
})

describe('setTeamDefaultFormat', () => {
  it('writes the format as a number, and null to clear it', async () => {
    await setTeamDefaultFormat('t1', 7)
    expect(updateMock).toHaveBeenCalledWith({ default_format: 7 })
    await setTeamDefaultFormat('t1', null)
    expect(updateMock).toHaveBeenCalledWith({ default_format: null })
  })

  it('refuses a value the database would refuse, before the request goes out', async () => {
    await expect(setTeamDefaultFormat('t1', 9)).rejects.toThrow(/7s, 10s, 12s or 15s/)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when RLS filters the write to zero rows', async () => {
    // CONTROL of the shape: data null AND error null is what a refused write
    // looks like through supabase-js — a perfectly successful nothing.
    updateMock.result = { data: null, error: null }
    await expect(setTeamDefaultFormat('t1', 12)).rejects.toThrow(/club admin/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/teams-default-format.test.js`
Expected: FAIL — `setTeamDefaultFormat is not a function` (or not exported).

- [ ] **Step 3: Write the function**

Append to `src/data/teams.js`:

```js
import { isFormat } from '../lib/fixtureFormat.js'

// ⚠️ ITS OWN MESSAGE, like the two above and for the same reason.
const REFUSED_FORMAT =
  "We couldn't save that. Only a club admin can change a squad's usual tournament format."

/**
 * Sets what a NEW tournament or friendly for this squad pre-selects — 7, 10,
 * 12 or 15 — or clears it with null (which the form reads as 15).
 *
 * ⚠️ A COLUMN, NEVER THE SQUAD'S NAME, the same rule scoring_kinds and
 * requires_contact carry above. Never read for a league match: those are
 * always 15 and the database enforces it (events_league_is_fifteen).
 *
 * ⚠️ THROWS WHEN RLS FILTERS THE WRITE TO ZERO ROWS — see setTeamScoringKinds.
 */
export async function setTeamDefaultFormat(teamId, format) {
  if (!teamId) throw new Error(REFUSED_FORMAT)
  if (format !== null && !isFormat(format)) {
    throw new Error('A squad plays 7s, 10s, 12s or 15s — nothing else can be saved.')
  }

  const { data, error } = await supabase
    .from('teams')
    .update({ default_format: format })
    .eq('id', teamId)
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message || REFUSED_FORMAT)
  if (!data) throw new Error(REFUSED_FORMAT)
  return data
}
```

Put the `import { isFormat }` line with the other imports at the top of the file, not mid-file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run tests/teams-default-format.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/teams.js tests/teams-default-format.test.js
git commit -m "feat(format): setTeamDefaultFormat — a squad's usual tournament format"
```

---

### Task 4: The event form

**Files:**
- Modify: `src/screens/EventForm.jsx` — `initialValues` (~line 349 and ~line 460), the payload `common` object (~line 1235), the competition UI block (~line 2273)
- Test: `tests/event-form-format.test.jsx` (create)

**Interfaces:**
- Consumes: `FORMATS`, `DEFAULT_FORMAT`, `formatLabel`, `isFormat` from `src/lib/fixtureFormat.js`; `isMinisTeam` already imported in this file; `COMPETITION_LEAGUE`, `COMPETITION_TOURNAMENT` already defined in this file; `Segmented` already defined in this file.
- Produces: the saved row carries `format: 7|10|12|15|null`. League always writes `15`. Non-match writes `null`.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/event-form-format.test.jsx
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from './helpers/pickDate.js'

// Format on the fixture (claude/plans/2026-09-02-fixture-format.md). The
// rule: a league match is 15 and is not asked; a tournament or friendly on a
// U11+ squad asks, pre-selecting the squad's default; a minis squad is never
// asked. Every positive here has its opposite as a control.

const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const insertEventsMock = vi.fn()
const listLeagueTeamsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: (...args) => insertEventsMock(...args),
  deleteEvent: async () => {},
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: (...args) => listLeagueTeamsMock(...args),
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const U18B = { id: 't-u18b', club_id: CLUB_ID, name: 'U18B Contact', sort_order: 14 }
const U18B_TWELVES = { ...U18B, id: 't-u18b-12', default_format: 12 }
const U8 = { id: 't-u8', club_id: CLUB_ID, name: 'U8 Tag', sort_order: 3 }
const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null }]

function renderForm({ event = null, teams = [U18B], initialKind = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onSaved = vi.fn()
  render(<EventForm event={event} initialKind={initialKind} onClose={() => {}} onSaved={onSaved} />)
  return { user: userEvent.setup(), onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  listLeagueTeamsMock.mockResolvedValue([])
  upsertEventMock.mockImplementation(async (row) => ({ id: 'e-new', ...row }))
})

async function fillMatchBasics(user) {
  await user.type(screen.getByLabelText(/opponent/i), 'Harness Exiles')
  await pickDate(user, screen.getByLabelText(/^date/i), '2026-10-10')
}

describe('fixture format on the event form', () => {
  it('a tournament on a U11+ squad offers 7s/10s/12s/15s, pre-selecting 15, and writes the pick', async () => {
    const { user } = renderForm()
    await fillMatchBasics(user)
    await user.selectOptions(screen.getByLabelText(/competition/i), 'tournament')
    const group = screen.getByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '15s' })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: '7s' }))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ competition_type: 'tournament', format: 7 })
  })

  it("pre-selects the squad's usual format for a tournament", async () => {
    const { user } = renderForm({ teams: [U18B_TWELVES] })
    await fillMatchBasics(user)
    await user.selectOptions(screen.getByLabelText(/competition/i), 'tournament')
    const group = screen.getByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '12s' })).toBeChecked()
    // CONTROL: 15 is NOT checked here — otherwise "pre-selects" is untested.
    expect(within(group).getByRole('radio', { name: '15s' })).not.toBeChecked()
  })

  it('a league match hides the control and writes 15 whatever was picked before', async () => {
    const { user } = renderForm()
    await fillMatchBasics(user)
    await user.selectOptions(screen.getByLabelText(/competition/i), 'tournament')
    await user.click(within(screen.getByRole('group', { name: /format/i })).getByRole('radio', { name: '7s' }))
    await user.selectOptions(screen.getByLabelText(/competition/i), 'league')
    expect(screen.queryByRole('group', { name: /format/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ competition_type: 'league', format: 15 })
  })

  it('a friendly asks too, and a minis squad is never asked', async () => {
    const { user } = renderForm()
    await fillMatchBasics(user)
    // "Neither — a friendly" is the default competition.
    expect(screen.getByRole('group', { name: /format/i })).toBeInTheDocument()

    const minis = renderForm({ teams: [U8] })
    await fillMatchBasics(minis.user)
    expect(screen.queryByRole('group', { name: /format/i })).toBeNull()
  })

  it('reopening a 10s fixture shows 10s checked, not the squad default', async () => {
    const event = {
      id: 'e-1', club_id: CLUB_ID, team_id: 't-u18b-12', type: 'match',
      competition_type: 'tournament', competition: 'Harness Sevens', format: 10,
      opponent: 'Harness Exiles', home: true, starts_at: '2026-10-10T05:00:00.000Z',
    }
    renderForm({ event, teams: [U18B_TWELVES] })
    const group = await screen.findByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '10s' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: '12s' })).not.toBeChecked()
  })

  it('a training session writes no format at all', async () => {
    const { user } = renderForm({ initialKind: 'training' })
    await user.type(screen.getByLabelText(/title/i), 'Harness training')
    await pickDate(user, screen.getByLabelText(/^date/i), '2026-10-10')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ format: null })
  })
})
```

If `fillMatchBasics` does not match the form's real labels (check `tests/event-form-placeholders.test.jsx` for the exact opponent and date helpers used there and copy them), adjust the helper, not the assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/event-form-format.test.jsx`
Expected: FAIL — `Unable to find an accessible element with the role "group" and name /format/i`.

- [ ] **Step 3: Wire the form**

At the top of `src/screens/EventForm.jsx`, with the other lib imports:

```js
import { DEFAULT_FORMAT, FORMATS, formatLabel, isFormat } from '../lib/fixtureFormat.js'
```

In `initialValues`, the `!event` branch (near the `competitionType: isTournamentKind ? COMPETITION_TOURNAMENT : ''` line, ~349), add:

```js
      // ⚠️ THE SQUAD'S USUAL FORMAT, OR 15. Read once when the sheet opens —
      // the team can change below and the effect after the form re-seeds it.
      format: String(
        isFormat(editableTeams.find((team) => team.id === fallbackTeamId)?.default_format)
          ? editableTeams.find((team) => team.id === fallbackTeamId).default_format
          : DEFAULT_FORMAT,
      ),
```

In the editing branch (near `competitionType:` at ~460), add:

```js
    // ⚠️ THE ROW'S OWN FORMAT, never the squad default — a reopened 10s
    // fixture must show 10s. Null reads as 15, the same fallback every reader
    // applies.
    format: String(isFormat(event.format) ? event.format : DEFAULT_FORMAT),
```

After the `minisSquad` / `leagueApplies` block (~line 885), add the gating and the re-seed:

```js
  // ⚠️ FORMAT IS ASKED FOR A TOURNAMENT OR A FRIENDLY ON A U11+ SQUAD, AND
  // NEVER FOR A LEAGUE MATCH — the league is 15s at every age (Jay, 2 Sep
  // 2026) and the database refuses anything else (events_league_is_fifteen).
  // Minis have their own formats and no match sheet, so nothing is offered.
  // claude/plans/2026-09-02-fixture-format.md.
  const showFormat =
    isMatch && !tournamentMode && !minisSquad && values.competitionType !== COMPETITION_LEAGUE

  // When the squad changes on a NEW fixture, follow that squad's usual format.
  // Editing keeps the row's own answer: a coach correcting the kick-off time
  // must not have the format silently swapped under them.
  useEffect(() => {
    if (editing) return
    const team = editableTeams.find((candidate) => candidate.id === teamId)
    setValues((current) => ({
      ...current,
      format: String(isFormat(team?.default_format) ? team.default_format : DEFAULT_FORMAT),
    }))
  }, [editing, teamId, editableTeams])
```

(`isMatch`, `tournamentMode`, `editing`, `teamId`, `editableTeams`, `setValues` all already exist in this component; put this block after every one of them is declared. `useEffect` is already imported.)

In the `common` payload object (~line 1235, beside `competition_type`), add:

```js
      // ⚠️ 15 FOR A LEAGUE MATCH, THE PICK OTHERWISE, NULL FOR A NON-MATCH.
      // Written as a NUMBER — the radio holds a string. A tournament
      // CONTAINER (tournamentMode) writes null: its games carry the format.
      format: !isMatch || tournamentMode
        ? null
        : values.competitionType === COMPETITION_LEAGUE
          ? DEFAULT_FORMAT
          : Number(values.format),
```

In the JSX, directly after the competition `<div className={FIELD}>…</div>` block that ends with the `minisSquad &&` hint (before the `{!tournamentMode && values.competitionType === COMPETITION_TOURNAMENT && (` tournament-name block, ~line 2366), add:

```jsx
            {showFormat && (
              <Segmented
                legend="Format"
                name="event-format"
                options={FORMATS.map((format) => ({ value: String(format), label: formatLabel(format) }))}
                value={values.format}
                onChange={(next) => setValues((current) => ({ ...current, format: next }))}
              />
            )}
```

Check `Segmented` renders its `<legend>` inside a `<fieldset>` — it does — so `getByRole('group', { name: /format/i })` finds it.

- [ ] **Step 4: Run the new test and the existing form tests**

Run: `npx.cmd vitest run tests/event-form-format.test.jsx tests/event-form.test.jsx tests/event-form-competition.test.jsx tests/event-form-placeholders.test.jsx`
Expected: all PASS. If an existing test asserts the exact payload with `toEqual`, it now needs `format: null` or `format: 15` — add it there; do not weaken the assertion to `toMatchObject`.

- [ ] **Step 5: Prove one assertion against an injected fault**

Change the payload's league arm to `Number(values.format)` temporarily; the "league writes 15" test must FAIL. Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/EventForm.jsx tests/event-form-format.test.jsx
git commit -m "feat(format): the event form asks 7s/10s/12s/15s for a tournament or friendly, never for the league"
```

Include any existing test file you adjusted in Step 4 in the `git add`.

---

### Task 5: Show the format where it is not 15

**Files:**
- Modify: `src/components/ScheduleTable.jsx` (the `event.competition` subtitle span, ~line 136)
- Modify: `src/screens/EventDetail.jsx` (the Competition `KeyValue`, ~line 638)
- Test: `tests/scheduleTable.test.jsx` (add two cases), `tests/event-detail-format.test.jsx` (create)

**Interfaces:**
- Consumes: `formatOf`, `formatLabel`, `DEFAULT_FORMAT` from `src/lib/fixtureFormat.js`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/scheduleTable.test.jsx` (inside its existing `describe`, using its existing render helper and fixture event — read the file first and copy the helper's name):

```jsx
  it('names the format on the subtitle only when it is not 15s', () => {
    renderRows([{ ...FIXTURE, id: 'sevens', competition: 'Harness Sevens', format: 7 }])
    expect(screen.getByText('7s · Harness Sevens')).toBeInTheDocument()
  })

  it('CONTROL: a 15s or unstated fixture shows no format word at all', () => {
    renderRows([
      { ...FIXTURE, id: 'fifteens', competition: 'Harness Cup', format: 15 },
      { ...FIXTURE, id: 'unstated', competition: 'Harness Shield', format: null },
    ])
    expect(screen.getByText('Harness Cup')).toBeInTheDocument()
    expect(screen.getByText('Harness Shield')).toBeInTheDocument()
    expect(screen.queryByText(/15s/)).toBeNull()
  })
```

Create `tests/event-detail-format.test.jsx`, modelled on whichever existing `tests/event-detail*.test.jsx` mounts `EventDetail` with a mocked `getEvent` (copy its mock block verbatim), with:

```jsx
  it('shows "Format 7s" on a 7s fixture and no Format row on a 15s one', async () => {
    mountDetail({ ...MATCH, competition_type: 'tournament', competition: 'Harness Sevens', format: 7 })
    expect(await screen.findByText('7s')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
    cleanup()
    mountDetail({ ...MATCH, competition_type: 'tournament', competition: 'Harness Cup', format: null })
    await screen.findByText('Harness Cup')
    expect(screen.queryByText('Format')).toBeNull()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx.cmd vitest run tests/scheduleTable.test.jsx tests/event-detail-format.test.jsx`
Expected: the two new schedule cases FAIL on `7s · Harness Sevens`; the detail case FAILS on `Format`.

- [ ] **Step 3: Implement**

`src/components/ScheduleTable.jsx` — import `{ DEFAULT_FORMAT, formatLabel, formatOf }` from `'../lib/fixtureFormat.js'` and replace the competition span:

```jsx
        {/* ⚠️ THE FORMAT IS SAID ONLY WHEN IT IS NOT 15s. Fifteen is the norm
            and naming it on every row is noise; "7s" on a tournament row is
            the one fact a parent packing boots wants. Null reads as 15
            (src/lib/fixtureFormat.js) so old rows are silent too. */}
        {(event.competition || formatOf(event) !== DEFAULT_FORMAT) && (
          <span className="mt-0.5 block text-[12px] font-medium text-ink-faint">
            {[
              formatOf(event) !== DEFAULT_FORMAT ? formatLabel(formatOf(event)) : null,
              event.competition || null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
```

`src/screens/EventDetail.jsx` — import the same three names and, after the Competition `KeyValue` block, add:

```jsx
        {/* Only when it is not 15s — see ScheduleTable for the reasoning. */}
        {event.type === 'match' && formatOf(event) !== DEFAULT_FORMAT && (
          <KeyValue label="Format">{formatLabel(formatOf(event))}</KeyValue>
        )}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx.cmd vitest run tests/scheduleTable.test.jsx tests/event-detail-format.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ScheduleTable.jsx src/screens/EventDetail.jsx tests/scheduleTable.test.jsx tests/event-detail-format.test.jsx
git commit -m "feat(format): schedule and detail say 7s/10s/12s, and stay quiet about 15s"
```

---

### Task 6: The match sheet sizes itself from the fixture

**Files:**
- Modify: `src/data/matchSheets.js` (the `SLOT_COUNT` comment only)
- Modify: `src/screens/MatchSheet.jsx` — `emptySlots`, `slotsFrom`, `slotsFromLineup`, the `slots` state seed, the table rows (~lines 68, 203-266, 289, 359, 459, 1157)
- Test: `tests/match-sheet-format.test.jsx` (create)

**Interfaces:**
- Consumes: `formatOf`, `sheetSlots` from `src/lib/fixtureFormat.js`; `SLOT_COUNT` from `src/data/matchSheets.js` stays exported and equals 22, now documented as the MAXIMUM a stored sheet may hold.
- Produces: `emptySlots(count)`, `slotsFrom(stored, count)`, `slotsFromLineup(picks, count)` — the count is always passed in by the screen from `sheetSlots(formatOf(event))`.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/match-sheet-format.test.jsx
// Copy the ENTIRE mock block and the `mount` helper from tests/match-sheets.test.jsx
// (lines 1-135 there) verbatim above this comment, then:

const SEVENS = {
  ...MATCH,
  id: 'e-7',
  team_id: 't-u18b',
  team: U18B,
  competition_type: 'tournament',
  competition: 'Harness Sevens',
  format: 7,
}

describe('match sheet slot count follows the fixture format', () => {
  it('a 7s fixture renders 12 named slots, not 22', async () => {
    getEventMock.mockResolvedValue(SEVENS)
    listPlayersMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    getMatchSheetMock.mockResolvedValue(null)
    mount(<MatchSheet />, { path: '/match-sheet/e-7', memberships: [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u18b' }] })
    await screen.findByText(/Harness Sevens/)
    const nameBoxes = screen.getAllByRole('textbox', { name: /player \d+ name/i })
    expect(nameBoxes).toHaveLength(12)
  })

  it('CONTROL: a fixture with no format still renders all 22', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: null })
    listPlayersMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    getMatchSheetMock.mockResolvedValue(null)
    mount(<MatchSheet />)
    await screen.findByText(/Dubai Exiles/)
    expect(screen.getAllByRole('textbox', { name: /player \d+ name/i })).toHaveLength(22)
  })

  it('a sheet saved with 22 rows on a fixture later made 10s keeps rows 16-22 and labels them', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: 10 })
    listPlayersMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    getMatchSheetMock.mockResolvedValue({
      id: 'sheet-1', event_id: 'e-1', status: 'draft',
      slots: Array.from({ length: 22 }, (_, i) => ({ slot: i + 1, player_id: null, full_name: `Harness Player ${i + 1}`, front_row: false })),
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByDisplayValue('Harness Player 22')
    expect(screen.getByText(/beyond the 15 allowed/i)).toBeInTheDocument()
    // CONTROL: the note is absent when nothing is beyond the limit.
    cleanup()
    getMatchSheetMock.mockResolvedValue({
      id: 'sheet-2', event_id: 'e-1', status: 'draft',
      slots: [{ slot: 1, player_id: null, full_name: 'Harness Player 1', front_row: false }],
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByDisplayValue('Harness Player 1')
    expect(screen.queryByText(/beyond the/i)).toBeNull()
  })
})
```

Check the accessible name of a slot's name input in `MatchSheet.jsx` (`SlotCells`, ~line 166) and match the regex to it exactly; if the inputs have no accessible name, add `aria-label={\`Player ${slot} name\`}` to them as part of this task — a form of 22 unlabeled inputs is an a11y defect anyway.

- [ ] **Step 2: Run to verify it fails**

Run: `npx.cmd vitest run tests/match-sheet-format.test.jsx`
Expected: the 7s case FAILS with 22 found instead of 12.

- [ ] **Step 3: Implement**

`src/data/matchSheets.js` — replace the `SLOT_COUNT` comment:

```js
/**
 * The MOST slots a stored sheet may hold — the 15s sheet's 22. Not the size
 * of any particular sheet: since 2 Sep 2026 that comes from the fixture's
 * format through src/lib/fixtureFormat.js (7s 12, 10s 15, 12s 18, 15s 22).
 * Kept as the storage bound so a row with slot 23 is still refused.
 */
export const SLOT_COUNT = 22
```

`src/screens/MatchSheet.jsx` — import `{ formatOf, sheetSlots }` from `'../lib/fixtureFormat.js'`, then:

```js
// The 22-row form is two columns of 11 on paper; a 12-slot 7s sheet is two
// columns of 6. Rows are derived from the count, never hard-coded.
function leftColumn(count) {
  return Array.from({ length: Math.ceil(count / 2) }, (unused, index) => index + 1)
}

function emptySlots(count) {
  return Array.from({ length: count }, (unused, index) => ({
    slot: index + 1,
    player_id: null,
    full_name: '',
    front_row: false,
  }))
}

/**
 * Fills the rows from whatever the sheet actually stored, gaps included.
 *
 * ⚠️ NEVER DROPS A STORED ROW. A sheet saved with 22 rows on a fixture that
 * was later changed to 10s comes back with all 22 — the rows past the
 * format's limit are kept and the screen labels them, because silently losing
 * seven names a coach typed is worse than showing a note. SLOT_COUNT is the
 * ceiling on what can be stored at all.
 */
function slotsFrom(stored, count) {
  const highest = Math.max(count, ...(stored ?? []).map((row) => Number(row.slot) || 0))
  const base = emptySlots(Math.min(highest, SLOT_COUNT))
  for (const row of stored ?? []) {
    if (row.slot >= 1 && row.slot <= SLOT_COUNT) {
      base[row.slot - 1] = {
        slot: row.slot,
        player_id: row.player_id ?? null,
        full_name: row.full_name ?? '',
        front_row: Boolean(row.front_row),
      }
    }
  }
  return base
}
```

Change `slotsFromLineup(picks)` to `slotsFromLineup(picks, count)` and its `picks.slice(0, SLOT_COUNT)` to `picks.slice(0, count)`, seeding from `emptySlots(count)`. Change `withLineup` to take the current `slots.length` as its bound if it references `SLOT_COUNT`.

In the component: derive `const slotCount = sheetSlots(formatOf(event))` right after `event` state is declared (it will be 22 until the event loads, which is the old behaviour). Seed `useState(() => emptySlots(22))`, and in the load `.then`, replace `slotsFrom(existing?.slots)` with `slotsFrom(existing?.slots, sheetSlots(formatOf(row)))`, and `slotsFromLineup(...)` calls with the count passed. Replace `LEFT_COLUMN.map(...)` with `leftColumn(slots.length).map(...)`, `LEFT_COLUMN.length` with `leftColumn(slots.length).length`, and the `right <= SLOT_COUNT` guard with `right <= slots.length`. Delete the `LEFT_COLUMN` constant.

Above the table, add the note:

```jsx
        {slots.length > slotCount && (
          <p className="mb-2 text-[13px] text-warn-ink">
            This sheet holds {slots.length} names but a {formatLabel(formatOf(event))} game allows
            {' '}{slotCount}. Rows {slotCount + 1}–{slots.length} are beyond the {slotCount} allowed and will not
            be accepted by the league — clear them, or change the fixture's format.
          </p>
        )}
```

(`formatLabel` needs importing too.) Make sure the "FR" front-row logic and the share facsimile read `slots.length` as well, not 22.

- [ ] **Step 4: Run the new test and every match-sheet test**

Run: `npx.cmd vitest run tests/match-sheet-format.test.jsx tests/match-sheets.test.jsx tests/match-sheet-deadline.test.js`
Expected: PASS. Existing tests assert 22 boxes on `MATCH`, which has no format, so they must keep passing untouched — if one breaks, the null-reads-as-22 path is wrong, not the test.

- [ ] **Step 5: Prove against an injected fault**

Temporarily make `sheetSlots` return 22 for everything (in the lib); the 7s case must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/data/matchSheets.js src/screens/MatchSheet.jsx tests/match-sheet-format.test.jsx
git commit -m "feat(format): the match sheet has as many slots as the fixture's format allows"
```

---

### Task 7: The lineup opens at the fixture's format

**Files:**
- Modify: `src/screens/Lineup.jsx` (the load effect's "no existing lineup" path, ~lines 231-300)
- Test: `tests/lineup-format-default.test.jsx` (create)

**Interfaces:**
- Consumes: `formatOf` from `src/lib/fixtureFormat.js`; `SIDE_SIZES` already contains 7, 10, 12 and 15.

- [ ] **Step 1: Write the failing test**

Model on `tests/lineup.test.jsx` — copy its mock block and mount helper verbatim, then:

```jsx
describe('lineup players-per-side defaults from the fixture format', () => {
  it('a new lineup on a 7s fixture opens at 7-a-side', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: 7 })
    listLineupsMock.mockResolvedValue([])
    mountLineup()
    const select = await screen.findByLabelText(/players per side/i)
    expect(select).toHaveValue('7')
  })

  it('CONTROL: an existing lineup keeps its own size whatever the fixture says', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: 7 })
    listLineupsMock.mockResolvedValue([{ id: 'l-1', event_id: 'e-1', players_per_side: 10, squad_size: null, lineup_players: [] }])
    mountLineup()
    const select = await screen.findByLabelText(/players per side/i)
    expect(select).toHaveValue('10')
  })

  it('a fixture with no format opens at 15', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: null })
    listLineupsMock.mockResolvedValue([])
    mountLineup()
    expect(await screen.findByLabelText(/players per side/i)).toHaveValue('15')
  })
})
```

Match the select's real accessible label (read `Lineup.jsx` ~line 770; the `<label>` text wraps the `<select>`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx.cmd vitest run tests/lineup-format-default.test.jsx`
Expected: the first and third cases FAIL (`value ""`); the control passes already.

- [ ] **Step 3: Implement**

In `src/screens/Lineup.jsx`, import `{ formatOf }` from `'../lib/fixtureFormat.js'`. In the load effect, after the `if (existing) { … }` block, add an `else` branch:

```js
        } else {
          // ⚠️ A NEW LINEUP OPENS AT THE FIXTURE'S FORMAT (2 Sep 2026) — 7 for
          // a 7s tournament, 15 for a league match or an unstated one. Still a
          // GUIDE, NOT A GATE: the coach can change it, and an existing lineup
          // above keeps whatever it was saved with. src/lib/fixtureFormat.js.
          setPerSide(formatOf(eventRow))
        }
```

- [ ] **Step 4: Run to verify it passes, plus the existing lineup tests**

Run: `npx.cmd vitest run tests/lineup-format-default.test.jsx tests/lineup.test.jsx tests/lineup-views.test.jsx tests/lineup-eligibility.test.jsx`
Expected: PASS. If an existing test asserted the select starts empty ("Not set"), it was asserting the old default; change that expectation to `'15'` and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Lineup.jsx tests/lineup-format-default.test.jsx
git commit -m "feat(format): a new lineup opens at the fixture's format"
```

---

### Task 8: The squad's usual tournament format, on the Club tab

**Files:**
- Modify: `src/screens/AdminClub.jsx` (the scoring sheet, after the Contact rugby switch, ~line 683)
- Test: `tests/admin-club-scoring.test.jsx` (add a case and the mock)

**Interfaces:**
- Consumes: `setTeamDefaultFormat` from `src/data/teams.js`; `FORMATS`, `formatLabel` from `src/lib/fixtureFormat.js`.

- [ ] **Step 1: Write the failing test**

In `tests/admin-club-scoring.test.jsx`: add `const setDefaultFormatMock = vi.fn()` beside the other mocks, add `setTeamDefaultFormat: (...args) => setDefaultFormatMock(...args),` to the `vi.mock('../src/data/teams.js', …)` factory, add `setDefaultFormatMock.mockResolvedValue({})` to `beforeEach`, and add:

```jsx
  it('saves the squad’s usual tournament format from the scoring sheet', async () => {
    const { user } = renderClub()
    await user.click(screen.getByRole('button', { name: /scoring for u16b/i }))
    const select = await screen.findByLabelText(/usual tournament format/i)
    expect(select).toHaveValue('')
    await user.selectOptions(select, '12')
    await waitFor(() => expect(setDefaultFormatMock).toHaveBeenCalledWith('team-u16b', 12))
    expect(reloadMock).toHaveBeenCalled()
  })

  it('clears it back to "15s (default)" with null', async () => {
    const { user } = renderClub([{ ...U16B, default_format: 7 }])
    await user.click(screen.getByRole('button', { name: /scoring for u16b/i }))
    const select = await screen.findByLabelText(/usual tournament format/i)
    expect(select).toHaveValue('7')
    await user.selectOptions(select, '')
    await waitFor(() => expect(setDefaultFormatMock).toHaveBeenCalledWith('team-u16b', null))
  })
```

Match the chip's real accessible name (read `ScoringChip`, ~line 128, for its `aria-label`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx.cmd vitest run tests/admin-club-scoring.test.jsx`
Expected: the two new cases FAIL on `usual tournament format`.

- [ ] **Step 3: Implement**

In `src/screens/AdminClub.jsx`: import `setTeamDefaultFormat` beside the other two `teams.js` imports and `{ FORMATS, formatLabel }` from `'../lib/fixtureFormat.js'`. Beside `saveRequiresContact`, add:

```js
  /** Same shape as saveRequiresContact: the select shows what the reload brings back. */
  async function saveDefaultFormat(next) {
    const id = scoringTeamId
    setSaving(true)
    setSaveError(null)
    try {
      await setTeamDefaultFormat(id, next === '' ? null : Number(next))
      await reloadTeams()
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }
```

After the Contact rugby `<div className="mt-3 flex items-center justify-between gap-3">…</div>`, add:

```jsx
          {/* ⚠️ A DEFAULT, NOT A RULE. What a NEW tournament or friendly for
              this squad pre-selects; every fixture still asks. A league match
              is always 15 and never reads this. Minis squads have their own
              formats and no sheet, so the control is hidden for them.
              claude/plans/2026-09-02-fixture-format.md. */}
          {!isMinisTeam(scoringTeam.name) && (
            <label className="mt-3 block">
              <span className="text-[13px] font-bold text-ink">Usual tournament format</span>
              <select
                aria-label="Usual tournament format"
                value={scoringTeam.default_format == null ? '' : String(scoringTeam.default_format)}
                disabled={saving}
                onChange={(domEvent) => saveDefaultFormat(domEvent.target.value)}
                className="mt-1 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none focus:border-brand"
              >
                <option value="">15s (default)</option>
                {FORMATS.filter((format) => format !== 15).map((format) => (
                  <option key={format} value={String(format)}>
                    {formatLabel(format)}
                  </option>
                ))}
              </select>
            </label>
          )}
```

`isMinisTeam` — import from `'../lib/minis.js'` if this file does not already.

- [ ] **Step 4: Run to verify it passes**

Run: `npx.cmd vitest run tests/admin-club-scoring.test.jsx`
Expected: PASS, including every pre-existing case.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AdminClub.jsx tests/admin-club-scoring.test.jsx
git commit -m "feat(format): a squad's usual tournament format, set beside scoring on the Club tab"
```

---

### Task 9: Docs, full suite, pull request

**Files:**
- Modify: `claude/changelog.md` (new entry at the top of `## 2 Sep 2026`, no SHA)
- Modify: `RESTORE.md` (the "22 slots" / `SLOT_COUNT` fact, wherever it is stated — `grep -n "22" RESTORE.md`)
- Modify: `claude/plans/2026-09-02-fixture-format.md` (status line)
- Modify: `claude/plans/2026-09-02-fixture-format-implementation.md` (status line)

- [ ] **Step 1: Changelog entry**

Add at the top of the `## 2 Sep 2026` section:

```markdown
- **feat(format): FORMAT ON THE FIXTURE — 7s, 10s, 12s or 15s.** Piece 1 of the
  senior-squads work, `claude/plans/2026-09-02-fixture-format.md`. A league match
  is always 15 and is not asked; a tournament or friendly on a U11+ squad asks,
  pre-selecting the squad's usual format (`teams.default_format`, set on the
  Club tab beside scoring); minis are never asked. The match sheet has as many
  slots as the format allows — 12/15/18/22 — which fixes the U18 10s sheet that
  had 22; a sheet saved with more rows than a later-changed format allows keeps
  them and says so. A new lineup opens at the fixture's format. Schedule and
  detail say "7s" only when it is not 15. Migration
  `db/migrations/20260902_fixture_format.sql` — applied to live 2 Sep 2026
  (Jay's go-ahead), harness `db/tests/fixture-format.sql` green against
  production, rollback proven. Null reads as 15 everywhere, so no existing row
  changed. The numbers live in `src/lib/fixtureFormat.js` and nowhere else.
```

- [ ] **Step 2: RESTORE.md**

Find the sentence that says the match sheet has 22 slots (or that `SLOT_COUNT` is the sheet's size) and rewrite it: "The sheet has as many slots as the fixture's format allows — 12, 15, 18 or 22 — from `src/lib/fixtureFormat.js`; `SLOT_COUNT` (22) is only the storage ceiling." If no such sentence exists, add one line under the match-sheet section.

- [ ] **Step 3: Status lines**

`claude/plans/2026-09-02-fixture-format.md`: change the status line to `**Status: SHIPPED — built 2 Sep 2026; see the implementation plan for the commits.**`
`claude/plans/2026-09-02-fixture-format-implementation.md`: change to `**Status: SHIPPED — executed 2 Sep 2026.**`

- [ ] **Step 4: Gates**

Run, in order, and every one must pass:

```bash
npm run docs:check
npm run lint
npm test
npm run db:check
```

`npm test` is the WHOLE suite. In a worktree, `tests/pwa-build.test.js` and the built-stylesheet tests need `npm install --include=dev` and `npm run build` in the worktree first (`CLAUDE.md`, the worktree paragraph).

- [ ] **Step 5: Commit and push, open the pull request**

```bash
git add claude/changelog.md RESTORE.md claude/plans/2026-09-02-fixture-format.md claude/plans/2026-09-02-fixture-format-implementation.md
git commit -m "docs: fixture format shipped — changelog, RESTORE, plan status"
npm run docs:check
git push -u origin claude/fixture-format
gh pr create --base main --head claude/fixture-format --title "feat(format): 7s/10s/12s/15s on the fixture; the match sheet sizes itself" --body-file -
```

The body states: what changed, that the migration is already applied to live and the harness is green, and that the U18 10s sheet is the visible fix. End with the Claude Code attribution line. **Do not merge.** Jay merges; a merge is a live deploy.

- [ ] **Step 6: After the merge — verify live**

Open a U18 tournament fixture on https://adhquins-clubhub.com, set it to 10s, open its match sheet, count 15 name boxes. Open a league fixture's form and confirm there is no Format control. Report both with what you saw, not with "deployed".

---

## Self-review

**Spec coverage.** Data (Task 2), lib (Task 1), event form (Task 4), event detail and schedule chip (Task 5), match sheet including the "beyond the N allowed" note (Task 6), lineup default (Task 7), Club tab (Task 8), tests for each, deploy and docs (Task 9). Notifications: none, as the spec says. Non-goals untouched.

**Placeholders.** None: every step carries its code or its exact command.

**Type consistency.** `format` is a number in the database, in `formatOf`, in payloads and in `setTeamDefaultFormat`; it is a string only inside the form's `values` and the two `<select>`/radio controls, and every boundary converts with `String()` or `Number()`. `sheetSlots(format)` and `squadMax(format)` return the same number by construction. `slotsFrom(stored, count)` and `slotsFromLineup(picks, count)` both take the count as their second argument.
