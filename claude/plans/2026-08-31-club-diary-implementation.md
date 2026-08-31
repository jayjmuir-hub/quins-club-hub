# Club Diary — Phase 1 Implementation Plan

**STATUS: NOT SHIPPED.** Written 31 Aug 2026. Phase 1 only — `info_only` and
the Club Diary kind. Phase 2 (`all_day`, multi-day spans, the feed branch) is
specified in `claude/plans/2026-08-31-club-diary.md` and is NOT in this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the club put dated items nobody replies to — kit collection, shop
opening, ball collection — on members' calendars, without producing a fixture
carrying an availability list nobody will ever fill in.

**Architecture:** One new boolean column on `public.events`. A fifth card in the
event-kind chooser maps to `type = 'social'` plus `info_only = true`, exactly as
the existing Tournament card maps to `type = 'match'` plus
`competition_type = 'tournament'`. No new `events.type` value, so none of the
dozen three-way branches on `type` can fall through silently. The calendar feed
is untouched: an info-only event is *supposed* to reach the calendar.

**Tech Stack:** Vite + React, Tailwind, Supabase (Postgres 17), vitest.
`db/tests/` harnesses run inside `begin`/`rollback` against production.

## Global Constraints

- **Never `git add -A`.** Stage explicit paths, every commit.
- **Never write a real person's name** into this repo — it is public and its
  members are mostly children. Invent fixture data; keep the shape.
- **`main` is production.** Nothing in this plan pushes to `main`. Work on a
  feature branch and open a pull request.
- **Announce before applying a migration.** Multiple sessions share this
  database; two applied the same migration on 31 Aug 2026 and left a duplicate
  history row that had to be cleaned by hand.
- **Run `npm install --include=dev`** before the first test run, unconditionally.
- **Do not run `npm test` while editing.** Use `npm run test:related -- <file>`
  during a task and the full `npm test` only before pushing.
- **Every new assertion must be proven against an injected fault.** A test that
  would pass against the bug it exists to catch is worse than no test.
- **Commit before injecting a fault** — `git checkout -- <file>` reverts to the
  last commit, not to "before my last edit".
- `'diary'` is a **UI kind only**. It must never be written to `events.type`.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `db/migrations/20260831_events_info_only.sql` (new) | Add the column | 1 |
| `db/tests/club-diary.sql` (new) | Prove the column's default and that availability is unaffected | 1 |
| `db/schema/tables.sql` (modify) | Capture the new column | 1 |
| `claude/schema-history.md` (modify) | Why the column exists | 1 |
| `src/lib/eventFormat.js` (modify) | `eventChipKind()`, `nextEventLabel()` | 2, 3 |
| `src/components/EventTypeIcon.jsx` (modify) | The diary mark | 2 |
| `src/components/Chip.jsx` (modify) | The diary variant | 2 |
| `src/components/EventKindChooser.jsx` (modify) | The fifth card | 4 |
| `src/screens/EventForm.jsx` (modify) | Kind mapping, payload, field hiding, the toggle guard | 5, 6 |
| `src/screens/EventDetail.jsx` (modify) | Suppress the RSVP block | 7 |
| `src/screens/Schedule.jsx` (modify) | The Diary pill and the filter | 8 |

`src/data/events.js` needs **no change**: both read paths select `'*'`, so
`info_only` arrives automatically. Task 1 asserts that rather than assuming it.

`src/screens/SocialWhatsOn.jsx` needs **no change**: it filters on `type`, and a
diary event is `type = 'social'`, so its Socials filter already includes them —
which is what the spec decided it should do. Task 9 pins that with a test so it
cannot be "tidied away" later by someone who thinks it looks like a bug.

---

### Task 1: The column, the harness, and the schema capture

**Files:**
- Create: `db/migrations/20260831_events_info_only.sql`
- Create: `db/tests/club-diary.sql`
- Modify: `db/schema/tables.sql`
- Modify: `claude/schema-history.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.events.info_only boolean not null default false`. Every
  later task reads or writes this column by that exact name.

**Grants:** none needed. `db/schema/grants.sql` records `events` as granted
`ALL` at **table** level to `anon, authenticated, postgres, service_role`, not
column-scoped, so a new column inherits. Do not add a grant; `docs:check` rule 7
only fires on a migration that grants on a table.

- [ ] **Step 1: Write the harness first, and watch it fail**

Create `db/tests/club-diary.sql`. It runs inside a transaction that rolls back,
so it is safe against production. Read `claude/runbooks/db-harnesses.md` before
running it.

```sql
-- Club Diary phase 1: the info_only column.
-- claude/plans/2026-08-31-club-diary.md
--
-- Runs inside begin/rollback (npm run db:check). Nothing here persists.
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is public and its members are
-- mostly children. Never identify a real row from a document.

begin;

-- CONTROL: the harness can see a column that definitely exists. Without this,
-- a zero from the probe below could mean "column absent" OR "probe broken",
-- and this repo has read an empty result as proof of absence twice.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'starts_at'
  ) then
    raise exception 'CONTROL FAILED: cannot see events.starts_at - the probe is broken, not the column';
  end if;
end $$;

-- 1. The column exists, is boolean, is NOT NULL, and defaults to false.
do $$
declare
  col record;
begin
  select data_type, is_nullable, column_default into col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'events' and column_name = 'info_only';

  if col is null then
    raise exception 'events.info_only is missing';
  end if;
  if col.data_type <> 'boolean' then
    raise exception 'events.info_only is %, expected boolean', col.data_type;
  end if;
  if col.is_nullable <> 'NO' then
    raise exception 'events.info_only is nullable, expected NOT NULL';
  end if;
  if col.column_default is distinct from 'false' then
    raise exception 'events.info_only defaults to %, expected false', col.column_default;
  end if;
end $$;

-- 2. An INSERT that omits info_only still works and lands false. This is the
--    assertion that protects the chat fixture-thread insert path, which carries
--    event_id and would break on a NOT NULL column with no default.
do $$
declare
  team uuid;
  new_id uuid;
  got boolean;
begin
  select id into team from public.teams order by sort_order limit 1;
  if team is null then
    raise exception 'CONTROL FAILED: no teams to attach a test event to';
  end if;

  insert into public.events (team_id, type, title, starts_at)
  values (team, 'social', 'Harness kit collection', now() + interval '30 days')
  returning id into new_id;

  select info_only into got from public.events where id = new_id;
  if got is not false then
    raise exception 'info_only defaulted to %, expected false', got;
  end if;
end $$;

rollback;
```

- [ ] **Step 2: Run the harness and watch it FAIL**

```bash
npm run db:check
```

Expected: FAIL with `events.info_only is missing`. **The CONTROL block must
pass** — if it raises `CONTROL FAILED`, the harness itself is broken and the
missing-column failure proves nothing. Do not proceed until the failure is the
one you expect, for the reason you expect.

- [ ] **Step 3: Write the migration**

Create `db/migrations/20260831_events_info_only.sql`:

```sql
-- Club Diary phase 1: events.info_only
--
-- Spec: claude/plans/2026-08-31-club-diary.md
--
-- A dated item nobody replies to — kit collection, the shop opening, a ball
-- collection. Before this, such a thing could only be a Social, which produces
-- a fixture carrying an availability list nobody will ever fill in, or a
-- Notice, which has no date column and so cannot reach a subscribed calendar.
--
-- ⚠️ THIS IS NOT A NEW events.type, DELIBERATELY. `type` is read by the
-- calendar feed, EVENT_TYPE_ICONS, the chip and detail marks, nextEventLabel
-- and three screen filters, every one of which branches on three known values.
-- A fourth would fall through each of them SILENTLY. A Club Diary entry is
-- `type = 'social'` with this flag set — the same shape a tournament already
-- uses (`type = 'match'`, `competition_type = 'tournament'`).
--
-- ⚠️ NOT NULL WITH A DEFAULT, and the default is load-bearing beyond tidiness:
-- chat's fixture-thread insert path carries event_id and inserts without
-- naming this column. A NOT NULL column with no default would break it.
--
-- ⚠️ NO GRANT NEEDED. `events` is granted ALL at table level (see
-- db/schema/grants.sql), not column-scoped, so this column inherits.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing row is correctly `false`: none of
-- them were created as information-only, and treating an old social as one
-- would hide replies people have already given.

alter table public.events
  add column if not exists info_only boolean not null default false;

comment on column public.events.info_only is
  'Dated item with nothing to RSVP to (kit collection, shop opening). Suppresses availability in the app; the calendar feed exports it like any other event.';

-- Assert the column landed as specified, so a partially-applied migration
-- fails here rather than in the app.
do $$
declare
  col record;
begin
  select data_type, is_nullable, column_default into col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'events' and column_name = 'info_only';

  if col is null
     or col.data_type <> 'boolean'
     or col.is_nullable <> 'NO'
     or col.column_default is distinct from 'false' then
    raise exception 'events.info_only did not land as specified: %', col;
  end if;
end $$;
```

- [ ] **Step 4: ANNOUNCE, then apply**

⚠️ **Tell peer sessions before applying.** Two sessions applied the same
migration concurrently on 31 Aug 2026 and left a duplicate row in the migration
history — duplicate rows are what break Supabase branching, and it had to be
cleaned by hand. Announce, apply, then say it is done.

Apply the migration to production.

- [ ] **Step 5: Run the harness and watch it PASS**

```bash
npm run db:check
```

Expected: PASS, including the CONTROL block.

- [ ] **Step 6: Capture the schema and the reasoning**

In `db/schema/tables.sql`, add `info_only boolean not null default false` to the
captured `public.events` definition, in the position the live table reports.

In `claude/schema-history.md`, add a section for this migration recording **why**
it is a column and not a type — the SQL carries the what, never the why, and the
next session to read it will otherwise propose a fourth `events.type`.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/20260831_events_info_only.sql db/tests/club-diary.sql db/schema/tables.sql claude/schema-history.md
git commit -m "feat(db): events.info_only — dated items nobody replies to"
```

---

### Task 2: The chip must not say "Social"

This is the defect if it is missed: a Club Diary **is** `type = 'social'`, and
`Chip` keys both colour and icon off `type`, so untouched it draws the People
icon and the word "Social" on a kit collection. That is the app asserting
something false, not a cosmetic slip.

**Files:**
- Modify: `src/lib/eventFormat.js`
- Modify: `src/components/EventTypeIcon.jsx`
- Modify: `src/components/Chip.jsx`
- Test: `tests/event-chip-kind.test.js` (create)

**Interfaces:**
- Consumes: `events.info_only` from Task 1.
- Produces: `eventChipKind(event) → 'diary' | 'match' | 'training' | 'social'`,
  exported from `src/lib/eventFormat.js`. Tasks 7 and 8 do not use it; the three
  chip-drawing components do.

- [ ] **Step 1: Write the failing test**

Create `tests/event-chip-kind.test.js`:

```js
// @vitest-environment node
// Nothing here touches the DOM. See vite.config.js for why that matters.
import { describe, it, expect } from 'vitest'
import { eventChipKind } from '../src/lib/eventFormat.js'

// Club Diary phase 1 — claude/plans/2026-08-31-club-diary.md.
// A diary entry IS type='social', so anything reading type alone calls a kit
// collection a social. This helper is the single place that distinction lives.

describe('eventChipKind', () => {
  it('returns diary for an info-only event, whatever its type says', () => {
    expect(eventChipKind({ type: 'social', info_only: true })).toBe('diary')
  })

  it('leaves ordinary events alone', () => {
    expect(eventChipKind({ type: 'social', info_only: false })).toBe('social')
    expect(eventChipKind({ type: 'match', info_only: false })).toBe('match')
    expect(eventChipKind({ type: 'training' })).toBe('training')
  })

  it('treats a missing or non-true info_only as false', () => {
    // Rows written before the migration, and any row read through a path that
    // does not select the column, must read as ordinary events rather than as
    // diary entries. Strict === true, matching the feed's own convention.
    expect(eventChipKind({ type: 'social' })).toBe('social')
    expect(eventChipKind({ type: 'social', info_only: null })).toBe('social')
    expect(eventChipKind({ type: 'social', info_only: undefined })).toBe('social')
  })

  it('survives a missing event without inventing a kind', () => {
    expect(eventChipKind(null)).toBe(null)
    expect(eventChipKind(undefined)).toBe(null)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/event-chip-kind.test.js
```

Expected: FAIL — `eventChipKind is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/lib/eventFormat.js`, beside `nextEventLabel`:

```js
/**
 * The chip kind for an event — 'diary' for an information-only entry, and
 * otherwise the event's own type.
 *
 * ⚠️ A CLUB DIARY ENTRY IS `type = 'social'`. Every component that draws a type
 * chip must ask this rather than reading `event.type`, or a kit collection
 * draws the People icon under the word "Social" — the app asserting something
 * false, not a cosmetic slip. See claude/plans/2026-08-31-club-diary.md.
 *
 * ⚠️ STRICT `=== true`, matching the calendar feed's convention for time_tbd.
 * A row read through a path that does not select the column, or written before
 * the migration, must read as an ordinary event rather than as a diary entry.
 */
export function eventChipKind(event) {
  if (!event) return null
  return event.info_only === true ? 'diary' : event.type
}
```

- [ ] **Step 4: Run it and verify it passes**

```bash
npm run test:related -- tests/event-chip-kind.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Add the diary mark**

In `src/components/EventTypeIcon.jsx`, add a calendar glyph beside the existing
icons and register it:

```jsx
// ⚠️ A CALENDAR, NOT A TROPHY OR A MEGAPHONE. The mark has to say "a date you
// keep, with nothing to answer" — a megaphone says announcement (which is the
// noticeboard, a different feature) and a trophy is already the tournament mark
// in EventKindChooser. See claude/plans/2026-08-31-club-diary.md.
function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

export const EVENT_TYPE_ICONS = {
  match: RugbyBallIcon,
  training: ConeIcon,
  social: PeopleIcon,
  // ⚠️ 'diary' IS NOT AN events.type — it comes from eventChipKind(), which
  // returns it for an info_only event. Adding it here is safe for the reason
  // the note above gives: this map is asked about chip kinds, and 'diary' is
  // not a result value, so the win/loss/draw chips are untouched.
  diary: CalendarIcon,
}
```

- [ ] **Step 6: Add the chip variant**

In `src/components/Chip.jsx`, inside `VARIANTS`:

```js
  // ⚠️ THE NEUTRAL PAIR, DELIBERATELY, AND THIS IS NOT LAZINESS. Every other
  // token pair in the design system is already spoken for (brand, accent,
  // warn, danger), and inventing a sixth would need a contrast measurement at
  // 11.5px bold against AA — a design-system change, not a chip change. The
  // surface-mute/ink-muted pair is already measured at ~6.0:1 and the chip
  // carries the word "Diary" plus its own calendar mark, so nothing depends on
  // colour alone to tell it apart. A dedicated colour is a follow-up with a
  // measurement, not a guess made here.
  diary: 'bg-surface-mute text-ink-muted',
```

- [ ] **Step 7: Point the chip-drawing components at the helper**

Find every component passing `event.type` into `Chip`:

```bash
grep -rn "type={event.type}\|type={e.type}" src/
```

Change each to pass `eventChipKind(event)`, importing it from
`src/lib/eventFormat.js`. Do not change `Chip` itself — it takes a kind string
and does not care where it came from, which is what makes this a one-line change
per call site.

- [ ] **Step 8: Prove the chip test discriminates**

Commit first — `git checkout --` reverts to the last commit, not to before your
last edit.

```bash
git add src/lib/eventFormat.js src/components/EventTypeIcon.jsx src/components/Chip.jsx tests/event-chip-kind.test.js
git commit -m "feat(events): eventChipKind — a diary entry is not a social"
```

Now inject the fault: change `eventChipKind` to `return event.type`.

```bash
npm run test:related -- tests/event-chip-kind.test.js
```

Expected: FAIL on the first test. Then `git checkout -- src/lib/eventFormat.js`
and confirm PASS again.

- [ ] **Step 9: Commit the remaining call sites**

```bash
git add src/
git commit -m "feat(events): draw the diary mark wherever a type chip is drawn"
```

⚠️ `git add src/` is a directory, not `-A`. Confirm with `git status` that
nothing unexpected is staged before committing.

---

### Task 3: `nextEventLabel` must not say "Next social"

**Files:**
- Modify: `src/lib/eventFormat.js`
- Test: `tests/event-format.test.js` (existing — add to it)

**Interfaces:**
- Consumes: `events.info_only`.
- Produces: no new export. Changes `nextEventLabel`'s behaviour only.

- [ ] **Step 1: Write the failing test**

Add to `tests/event-format.test.js`:

```js
  it('does not call an information-only event a social', () => {
    // A kit collection is type='social'. Home would otherwise head its card
    // "Next social", which is wrong in a way a parent would act on.
    expect(nextEventLabel({ type: 'social', info_only: true })).toBe('Next up')
  })

  it('still calls an ordinary social a social', () => {
    expect(nextEventLabel({ type: 'social', info_only: false })).toBe('Next social')
  })
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/event-format.test.js
```

Expected: FAIL — received `'Next social'`, expected `'Next up'`.

- [ ] **Step 3: Implement**

In `src/lib/eventFormat.js`, add the first line of `nextEventLabel`:

```js
export function nextEventLabel(event) {
  // ⚠️ FIRST, BEFORE THE TYPE CHECKS, AND THE ORDER IS THE WHOLE FIX. A Club
  // Diary entry is type='social', so the social branch below would claim it.
  if (event?.info_only === true) return 'Next up'
  if (event?.type === 'match') return 'Next fixture'
  if (event?.type === 'training') return 'Next training'
  if (event?.type === 'social') return 'Next social'
  // Unknown or missing type: say something true rather than guess.
  return 'Next up'
}
```

- [ ] **Step 4: Run it and verify it passes**

```bash
npm run test:related -- tests/event-format.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit, then prove the ORDER is what matters**

```bash
git add src/lib/eventFormat.js tests/event-format.test.js
git commit -m "fix(events): an info-only event is not 'Next social'"
```

Inject the fault: move the `info_only` line to *after* the social check. Run the
test — it must FAIL. This is the real assertion; a test that passes with the
line in either position would prove nothing. Restore with
`git checkout -- src/lib/eventFormat.js`.

---

### Task 4: The fifth chooser card

**Files:**
- Modify: `src/components/EventKindChooser.jsx`
- Test: `tests/event-kind-chooser.test.jsx` (existing — add to it)

**Interfaces:**
- Consumes: nothing.
- Produces: `onPick('diary')`. Task 5 consumes exactly that string.

- [ ] **Step 1: Write the failing test**

In `tests/event-kind-chooser.test.jsx`, add:

```jsx
  it('offers Club Diary as a fifth kind', () => {
    render(<EventKindChooser onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /^Club Diary/ })).toBeInTheDocument()
  })

  it('calls onPick with diary', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<EventKindChooser onPick={onPick} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^Club Diary/ }))
    expect(onPick).toHaveBeenCalledWith('diary')
  })
```

Also update the existing "offers the four kinds" test to say five, adding
`'Club Diary'` to its label list, and rename it to `offers the five kinds under
the prompt`.

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/event-kind-chooser.test.jsx
```

Expected: FAIL — unable to find a button matching `/^Club Diary/`.

- [ ] **Step 3: Implement**

In `src/components/EventKindChooser.jsx`, import `CalendarIcon`. Since Task 2
defined it inside `EventTypeIcon.jsx`, export it there and import it here rather
than drawing a second copy — two glyphs for one idea is exactly the drift the
tournament trophy comment warns about.

Add to `KINDS`:

```js
  // ⚠️ FULL WIDTH, AND NOT ONLY BECAUSE FIVE DOES NOT DIVIDE BY TWO. The four
  // above are things that happen on a pitch; this one is not, and the layout
  // should say so. `span` is read by the grid below.
  { kind: 'diary', label: 'Club Diary', hint: 'On the calendar, nothing to reply to', Icon: CalendarIcon, span: true },
```

And in the map, apply the span:

```jsx
        {KINDS.map(({ kind, label, hint, Icon, span }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            className={`flex flex-col items-start gap-1.5 rounded-[13px] border-[1.5px] border-line bg-surface-card p-3.5 text-left outline-none transition hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2${span ? ' col-span-2' : ''}`}
          >
```

- [ ] **Step 4: Run it and verify it passes**

```bash
npm run test:related -- tests/event-kind-chooser.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/EventKindChooser.jsx src/components/EventTypeIcon.jsx tests/event-kind-chooser.test.jsx
git commit -m "feat(events): Club Diary in the what-are-you-adding chooser"
```

---

### Task 5: `EventForm` maps the kind and writes the column

**Files:**
- Modify: `src/screens/EventForm.jsx`
- Test: `tests/event-form-diary.test.jsx` (create)

**Interfaces:**
- Consumes: `onPick('diary')` from Task 4, arriving as the `initialKind` prop.
- Produces: an event row with `type = 'social'` and `info_only = true`.

- [ ] **Step 1: Write the failing test**

Create `tests/event-form-diary.test.jsx`. Follow the mocking conventions in the
existing `tests/event-form.test.jsx` — read it first and copy its setup verbatim
rather than inventing a second harness.

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventForm from '../src/screens/EventForm.jsx'

// Club Diary phase 1 — claude/plans/2026-08-31-club-diary.md.
// ⚠️ INVENTED DATA ONLY. This repo is public.

describe('EventForm opened as a Club Diary', () => {
  it('saves type=social with info_only true', async () => {
    const user = userEvent.setup()
    const { upsertEvent } = await import('../src/data/events.js')

    render(<EventForm initialKind="diary" onClose={() => {}} onSaved={() => {}} />)

    await user.type(screen.getByLabelText(/Title/i), 'Kit collection')
    await user.click(screen.getByRole('button', { name: /Save/i }))

    const payload = upsertEvent.mock.calls.at(-1)[0]
    expect(payload.type).toBe('social')
    expect(payload.info_only).toBe(true)
  })

  it('never writes diary into events.type', async () => {
    // 'diary' is a UI kind. If it ever reaches the column, every three-way
    // branch on type in this app falls through silently.
    const user = userEvent.setup()
    const { upsertEvent } = await import('../src/data/events.js')

    render(<EventForm initialKind="diary" onClose={() => {}} onSaved={() => {}} />)
    await user.type(screen.getByLabelText(/Title/i), 'Ball collection')
    await user.click(screen.getByRole('button', { name: /Save/i }))

    expect(upsertEvent.mock.calls.at(-1)[0].type).not.toBe('diary')
  })

  it('hides the match-only fields and the availability control', () => {
    render(<EventForm initialKind="diary" onClose={() => {}} onSaved={() => {}} />)

    expect(screen.queryByLabelText(/Opponent/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Self-service availability/i)).not.toBeInTheDocument()
  })

  it('still requires a title, like any non-match', async () => {
    const user = userEvent.setup()
    const { upsertEvent } = await import('../src/data/events.js')
    upsertEvent.mockClear()

    render(<EventForm initialKind="diary" onClose={() => {}} onSaved={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Save/i }))

    expect(upsertEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/event-form-diary.test.jsx
```

Expected: FAIL — `payload.info_only` is `undefined`.

- [ ] **Step 3: Map the kind in `initialValues`**

In `src/screens/EventForm.jsx`, extend the kind translation:

```js
    // ⚠️ THE CHOOSER'S KIND, TRANSLATED TO COLUMNS. 'tournament' is a match
    // whose competition_type is 'tournament'; 'diary' is a SOCIAL whose
    // info_only is true. Neither string is ever stored. Null (opened without
    // the chooser) keeps the historic default of a Match.
    const isTournamentKind = initialKind === 'tournament'
    const isDiaryKind = initialKind === 'diary'
    const type = isTournamentKind
      ? 'match'
      : isDiaryKind
        ? 'social'
        : initialKind === 'training' || initialKind === 'social' || initialKind === 'match'
          ? initialKind
          : 'match'
```

and add to the returned object:

```js
      infoOnly: isDiaryKind,
```

For the editing branch (where an existing `event` is passed), add:

```js
      infoOnly: event.info_only === true,
```

- [ ] **Step 4: Derive the flag and hide the fields**

Beside `isMatch` and `isTournament`:

```js
  // ⚠️ A CLUB DIARY IS A SOCIAL WITH NOTHING TO ANSWER. Everything this hides
  // is a question the entry does not ask: no opponent, no competition, no
  // pitch, and above all no availability — the whole point of the kind.
  const isDiary = values.infoOnly === true
```

Wrap the Self-service availability control in `{!isDiary && (…)}`, and the pitch
and pitch-portion controls likewise. The match-only fields are already gated on
`isMatch`, which is false here, so they need no change.

- [ ] **Step 5: Write the column**

In the `common` payload object — **not** the per-squad one — add:

```js
      // ⚠️ IN `common`, LIKE availability_override AND FOR THE SAME REASON:
      // whether an entry is information-only is a fact about the EVENT, true
      // of every squad in a fan-out and every week of a repeating series.
      info_only: isDiary,
```

Also force the availability override to its default, so a diary entry cannot
carry a stale 'open' or 'locked' from a type switch:

```js
      availability_override: isDiary ? 'auto' : values.availabilityOverride,
```

- [ ] **Step 6: Run it and verify it passes**

```bash
npm run test:related -- tests/event-form-diary.test.jsx
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit and prove the mapping discriminates**

```bash
git add src/screens/EventForm.jsx tests/event-form-diary.test.jsx
git commit -m "feat(events): EventForm writes info_only for a Club Diary"
```

Inject the fault: change `info_only: isDiary` to `info_only: false`. The first
test must FAIL. Restore with `git checkout -- src/screens/EventForm.jsx`.

---

### Task 6: Refuse the toggle when replies already exist

**Files:**
- Modify: `src/screens/EventForm.jsx`
- Test: `tests/event-form-diary.test.jsx` (add to it)

**Interfaces:**
- Consumes: `listAvailability(eventId)` from `src/data/availability.js`, which
  returns an array and throws on error.
- Produces: no new export.

**Why refuse rather than delete or ignore:** silently orphaning the availability
rows hides data that still exists; silently deleting them destroys a coach's
answer. Refusing is the only option that cannot lose information.

- [ ] **Step 1: Write the failing test**

```jsx
  it('refuses to make an event info-only when replies already exist', async () => {
    const user = userEvent.setup()
    const { upsertEvent } = await import('../src/data/events.js')
    const { listAvailability } = await import('../src/data/availability.js')
    upsertEvent.mockClear()
    listAvailability.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }])

    const existing = {
      id: 'e1', type: 'social', title: 'End of term BBQ', info_only: false,
      starts_at: '2026-09-11T15:00:00Z', team_id: 't1',
    }
    render(<EventForm event={existing} onClose={() => {}} onSaved={() => {}} />)

    await user.click(screen.getByLabelText(/nothing to reply to/i))
    await user.click(screen.getByRole('button', { name: /Save/i }))

    expect(await screen.findByText(/3 people have already replied/i)).toBeInTheDocument()
    expect(upsertEvent).not.toHaveBeenCalled()
  })

  it('allows the toggle when nobody has replied', async () => {
    const user = userEvent.setup()
    const { upsertEvent } = await import('../src/data/events.js')
    const { listAvailability } = await import('../src/data/availability.js')
    upsertEvent.mockClear()
    listAvailability.mockResolvedValue([])

    const existing = {
      id: 'e2', type: 'social', title: 'Quiz night', info_only: false,
      starts_at: '2026-09-11T15:00:00Z', team_id: 't1',
    }
    render(<EventForm event={existing} onClose={() => {}} onSaved={() => {}} />)

    await user.click(screen.getByLabelText(/nothing to reply to/i))
    await user.click(screen.getByRole('button', { name: /Save/i }))

    expect(upsertEvent).toHaveBeenCalled()
    expect(upsertEvent.mock.calls.at(-1)[0].info_only).toBe(true)
  })
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/event-form-diary.test.jsx
```

Expected: FAIL — no checkbox matching `/nothing to reply to/i`.

- [ ] **Step 3: Add the checkbox for the editing case**

A diary entry created from the chooser needs no control — the kind decided it.
But an admin editing an existing social must be able to reclassify it, so render
a checkbox when `editing` and the type is social:

```jsx
{editing && values.type === 'social' && (
  <label className="flex items-start gap-2">
    <input
      type="checkbox"
      checked={values.infoOnly}
      onChange={(e) => setValues((v) => ({ ...v, infoOnly: e.target.checked }))}
    />
    <span>
      Information only — on the calendar, nothing to reply to
    </span>
  </label>
)}
```

- [ ] **Step 4: Add the guard in the save path**

Before the payload is written, when the flag is being turned **on** for an event
that did not have it:

```js
  // ⚠️ REFUSE, DO NOT ORPHAN AND DO NOT DELETE. Turning this on hides the
  // availability UI, but the rows stay in the database — invisible data is
  // worse than absent data, and deleting a coach's answers to tidy up a
  // reclassification is worse than both. Refusing is the only outcome that
  // cannot lose information. claude/plans/2026-08-31-club-diary.md.
  const turningInfoOnly = isDiary && editing && event?.info_only !== true
  if (turningInfoOnly) {
    const replies = await listAvailability(event.id)
    if (replies.length > 0) {
      setError(
        new Error(
          `${replies.length} ${replies.length === 1 ? 'person has' : 'people have'} already replied to this — delete their replies first, or leave it as a social.`,
        ),
      )
      setSaving(false)
      return
    }
  }
```

Import `listAvailability` from `../data/availability.js`.

- [ ] **Step 5: Run it and verify it passes**

```bash
npm run test:related -- tests/event-form-diary.test.jsx
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit and prove the guard discriminates**

```bash
git add src/screens/EventForm.jsx tests/event-form-diary.test.jsx
git commit -m "feat(events): refuse info-only when replies already exist"
```

Inject the fault: delete the `if (replies.length > 0)` block. The refusal test
must FAIL — and check it fails on `upsertEvent` having been called, not on the
message being absent, or the test is only asserting the copy. Restore with
`git checkout -- src/screens/EventForm.jsx`.

---

### Task 7: `EventDetail` shows no RSVP block

**Files:**
- Modify: `src/screens/EventDetail.jsx`
- Test: `tests/event-detail-diary.test.jsx` (create)

**Interfaces:**
- Consumes: `events.info_only`.
- Produces: no new export.

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EventDetail from '../src/screens/EventDetail.jsx'

// Club Diary phase 1 — claude/plans/2026-08-31-club-diary.md.
// ⚠️ INVENTED DATA ONLY.

describe('EventDetail for an information-only event', () => {
  const diary = {
    id: 'e9', type: 'social', title: 'Kit collection', info_only: true,
    starts_at: '2026-09-17T14:00:00Z', team_id: 't1',
  }

  it('offers no availability button even when a handler is passed', () => {
    render(<EventDetail event={diary} onOpenAvailability={vi.fn()} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /availability/i })).not.toBeInTheDocument()
  })

  it('still offers it for an ordinary social', () => {
    // The control. Without this, the assertion above would pass just as well
    // if the button had been removed for everyone.
    render(
      <EventDetail
        event={{ ...diary, info_only: false, title: 'Welcome back party' }}
        onOpenAvailability={vi.fn()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /availability/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/event-detail-diary.test.jsx
```

Expected: FAIL on the first test — the button is found.

- [ ] **Step 3: Implement**

In `src/screens/EventDetail.jsx`, gate both the summary and the button:

```jsx
{!event.info_only && <AvailabilitySummary eventId={event.id} />}
```

```jsx
{!event.info_only && onOpenAvailability && (
```

- [ ] **Step 4: Run it and verify it passes**

```bash
npm run test:related -- tests/event-detail-diary.test.jsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit and prove the control works**

```bash
git add src/screens/EventDetail.jsx tests/event-detail-diary.test.jsx
git commit -m "feat(events): no RSVP block on an information-only event"
```

Inject the fault: change the gate to `{false && onOpenAvailability && (`, hiding
the button for everyone. The **second** test must FAIL. That is what proves the
first test is measuring the flag and not the button's existence. Restore with
`git checkout -- src/screens/EventDetail.jsx`.

---

### Task 8: The Diary filter on Schedule

**Files:**
- Modify: `src/screens/Schedule.jsx`
- Test: `tests/schedule-diary-filter.test.js` (create)

**Interfaces:**
- Consumes: `filterByType(events, typeFilter)`, already exported from
  `src/screens/Schedule.jsx`.
- Produces: a `'diary'` filter id, and a `'social'` filter that now EXCLUDES
  diary entries.

⚠️ **`TYPE_FILTERS` are pills, not the screen's tabs** — the tabs are
upcoming/results/calendar. This adds a fifth pill to the type row.

- [ ] **Step 1: Write the failing test**

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { filterByType } from '../src/screens/Schedule.jsx'

// Club Diary phase 1 — claude/plans/2026-08-31-club-diary.md.

const party = { id: '1', type: 'social', info_only: false }
const kit = { id: '2', type: 'social', info_only: true }
const match = { id: '3', type: 'match' }
const all = [party, kit, match]

describe('filterByType with Club Diary', () => {
  it('Diary shows only information-only entries', () => {
    expect(filterByType(all, 'diary')).toEqual([kit])
  })

  it('Socials no longer sweeps up diary entries', () => {
    // A kit collection is not a social. Before this, the type filter would
    // have shown it under Socials silently.
    expect(filterByType(all, 'social')).toEqual([party])
  })

  it('Everything still shows everything', () => {
    expect(filterByType(all, 'all')).toEqual(all)
  })

  it('an unrecognised filter still returns everything, not nothing', () => {
    expect(filterByType(all, 'nonsense')).toEqual(all)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm run test:related -- tests/schedule-diary-filter.test.js
```

Expected: FAIL — `filterByType(all, 'diary')` returns everything (because
`'diary'` is not yet in `TYPE_IDS`), and `'social'` returns both socials.

- [ ] **Step 3: Implement**

Add the pill to `TYPE_FILTERS`:

```js
  { id: 'diary', label: 'Diary', empty: 'Nothing in the club diary. Try Everything to see what else is on.' },
```

and rewrite the tail of `filterByType`:

```js
export function filterByType(events, typeFilter) {
  if (!Array.isArray(events)) return []
  if (!typeFilter || !TYPE_IDS.includes(typeFilter) || typeFilter === ALL_TYPES_ID) return events
  // ⚠️ 'diary' IS NOT AN events.type — it is type='social' with info_only set,
  // so the two branches here are the whole distinction. Without the second,
  // Socials silently includes kit collections, which is the thing the Club
  // Diary kind exists to stop. claude/plans/2026-08-31-club-diary.md.
  if (typeFilter === 'diary') return events.filter((event) => event?.info_only === true)
  if (typeFilter === 'social') {
    return events.filter((event) => event?.type === 'social' && event?.info_only !== true)
  }
  return events.filter((event) => event?.type === typeFilter)
}
```

- [ ] **Step 4: Run it and verify it passes**

```bash
npm run test:related -- tests/schedule-diary-filter.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Check the pill row on a narrow phone**

Five pills may overflow. Open the Schedule screen at a 360px viewport and look
at the type-filter row. If it overflows, make the row horizontally scrollable —
**do not** shorten "Everything" or fold Diary into Socials, which is the exact
conflation this task exists to prevent.

- [ ] **Step 6: Commit and prove the social branch discriminates**

```bash
git add src/screens/Schedule.jsx tests/schedule-diary-filter.test.js
git commit -m "feat(schedule): a Diary filter, and Socials stops sweeping it up"
```

Inject the fault: delete the `typeFilter === 'social'` branch. The second test
must FAIL. Restore with `git checkout -- src/screens/Schedule.jsx`.

---

### Task 9: Pin `SocialWhatsOn`'s deliberate no-op

`src/screens/SocialWhatsOn.jsx` filters on `type`, so its Socials filter already
includes diary entries — which the spec decided is correct, because the media
team's own look-ahead poster lists kit collection. **This task changes no
source.** It exists so the behaviour is deliberate and documented rather than
accidental, and so nobody later "fixes" it to match Schedule.

**Files:**
- Test: `tests/social-whats-on-diary.test.jsx` (create)
- Modify: `src/screens/SocialWhatsOn.jsx` (comment only)

- [ ] **Step 1: Write the test — it should PASS immediately**

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SocialWhatsOn from '../src/screens/SocialWhatsOn.jsx'

// Club Diary phase 1 — claude/plans/2026-08-31-club-diary.md.
//
// ⚠️ THIS TEST ASSERTS A DELIBERATE NON-CHANGE. Schedule EXCLUDES diary entries
// from Socials; this screen INCLUDES them, on purpose — the media team posts
// about kit collection, and the poster that started this feature proves it.
// Mock and render per the conventions in tests/social-whats-on.test.jsx.

describe('SocialWhatsOn', () => {
  it('lists information-only events alongside socials', async () => {
    // Fixture: one ordinary social and one kit collection, both type='social'.
    render(<SocialWhatsOn />)
    expect(await screen.findByText('Kit collection')).toBeInTheDocument()
    expect(await screen.findByText('Welcome back party')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it passes WITHOUT any source change**

```bash
npm run test:related -- tests/social-whats-on-diary.test.jsx
```

Expected: PASS. If it fails, the assumption that this screen needs no change is
wrong — stop and re-read `src/screens/SocialWhatsOn.jsx` before writing code.

- [ ] **Step 3: Record why the screens differ**

Add a comment above `FILTERS` in `src/screens/SocialWhatsOn.jsx`:

```js
// ⚠️ THIS SCREEN'S "Socials" DELIBERATELY INCLUDES CLUB DIARY ENTRIES, AND
// Schedule's DELIBERATELY DOES NOT. Not an oversight: a parent filtering the
// schedule to Socials does not want a kit collection, but the media team does
// — the club's own look-ahead poster lists one. Pinned by
// tests/social-whats-on-diary.test.jsx. claude/plans/2026-08-31-club-diary.md.
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/SocialWhatsOn.jsx tests/social-whats-on-diary.test.jsx
git commit -m "test(social): pin that the media screen keeps diary entries"
```

---

### Task 10: Documentation, full suite, and live verification

**Files:**
- Modify: `RESTORE.md`
- Modify: `claude/changelog.md`
- Modify: `claude/plans/2026-08-31-club-diary.md` (status line)

- [ ] **Step 1: Run the whole suite**

```bash
npm test
```

Expected: PASS. This is the first full run in this plan — everything before it
used `test:related`.

- [ ] **Step 2: Run the documentation checks**

```bash
npm run docs:check
```

⚠️ **Run this AFTER committing, not only after staging.** The changelog's
one-behind allowance is measured against `HEAD`, so a SHA that is legal when you
stage becomes illegal the moment you commit on top of it.

⚠️ **A new doc must be STAGED to be seen at all.** Four of the nine checks read
`git ls-files "*.md"` — the path, count, `git add -A` and stale-term checks —
so an untracked file passes them vacuously.

- [ ] **Step 3: Record the behaviour in `RESTORE.md`**

Add a short section under the events material stating what `info_only` is, that
`'diary'` is a UI kind never stored, and that Schedule and SocialWhatsOn
deliberately disagree about whether Socials includes it.

- [ ] **Step 4: Update the spec's status line**

In `claude/plans/2026-08-31-club-diary.md`, change the STATUS line to record
that phase 1 shipped and phase 2 has not.

- [ ] **Step 5: Add the changelog entry**

Leave it **un-SHA'd**. Cite the squash SHA of the previous merge, and verify
that debt is unpaid against `origin/main` first rather than trusting a handed
SHA — count citations for the candidate plus two SHAs you know are cited, and
treat a zero as meaningful only when the controls come back as one.

- [ ] **Step 6: Commit, push, open a pull request**

```bash
git add RESTORE.md claude/changelog.md claude/plans/2026-08-31-club-diary.md
git commit -m "docs: Club Diary phase 1 shipped"
git push origin <branch>:<branch>
```

⚠️ **Do not merge without Jay's explicit yes.** `main` is production and a push
there is a live release. A stop hook asking is not Jay asking.

- [ ] **Step 7: Verify LIVE, after the deploy**

A green suite is not a working site. After the merge deploys:

1. Create a Club Diary entry on the live site — a kit collection, invented
   detail, on a real squad.
2. Confirm it shows a **Diary** chip with the calendar mark, not "Social".
3. Confirm the event detail offers **no** availability button.
4. Confirm it appears under the **Diary** pill on Schedule and **not** under
   Socials.
5. **Fetch the deployed `/calendar.ics` and confirm the entry is in it.** This
   is the assertion phase 1 cannot make in CI: the feed is a Deno function with
   `Deno.serve()` at module scope, so the suite cannot execute it, and the
   existing calendar tests are rot detectors rather than behaviour tests. Check
   the `content-type` as well as the body — the SPA catch-all answers any path
   with HTML, so a 200 alone proves nothing.
6. Delete the test entry.

## Self-review notes

**Spec coverage.** Every phase 1 item in the spec maps to a task: the column
(1), the chip defect (2), `nextEventLabel` (3), the chooser card (4), the form
mapping and hidden fields (5), the RSVP refusal (6), EventDetail (7), the
Schedule filter (8), the SocialWhatsOn no-op (9), docs and live checks (10).
Phase 2 items — `all_day`, the three-way time control, multi-day spans, the feed
branch, the `all_day`/`time_tbd` check constraint — are deliberately absent.

**One assertion the spec listed that this plan does NOT automate.** "A diary
event still exports to the calendar" cannot be a unit test: the feed cannot be
executed by the suite. It is Task 10 step 7 item 5 instead, as a live check.
Writing it as a source-text assertion would have been a negative check that
passes for the wrong reason.

**Known gap, stated rather than hidden.** The `diary` chip reuses the neutral
colour pair because every other token pair is spoken for and inventing a sixth
needs a contrast measurement at 11.5px bold. The chip is still distinguishable
by its word and its calendar mark. A dedicated colour is a follow-up with a
measurement, not a guess.
