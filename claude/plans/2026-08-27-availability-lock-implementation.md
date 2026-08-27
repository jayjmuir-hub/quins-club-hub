# Availability Clear + Self-Edit Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**STATUS: NOT YET SHIPPED** — plan written 27 Aug 2026. Design spec:
`claude/plans/2026-08-27-availability-clear-and-lock-window.md`.

**Goal:** Let a parent/player clear their child's availability (delete the row)
by clicking the selected status again, and lock every self-edit a fixed number
of calendar days before the event — 5 days for matches, 1 for training, never
for socials — enforced in Supabase RLS and reflected in the sheet. Staff are
never locked.

**Architecture:** RLS is the real gate (a `private.availability_self_editable`
helper shared by the insert/update/delete policies); the React sheet computes
the same cutoff client-side only to disable controls and explain the lock. The
9-Aug staff-only-delete rule is reversed and the RLS rot-anchor repointed.

**Tech Stack:** Vite + React, Tailwind, Vitest + Testing Library, Supabase
Postgres 17 with RLS, `node-postgres` harnesses run by `scripts/db-check.mjs`.

## Global Constraints

- **Install deps with `npm install --include=dev`** — an ambient
  `NODE_ENV=production` silently drops Vitest/`pg` otherwise.
- **Feedback loop:** `npm run test:related -- <file>` while editing one file;
  `npm test` (~40s, 107 files) only before a commit that finishes a task.
- **Never `git add -A`.** Stage explicit paths every commit.
- **Club timezone is `Asia/Dubai`, a fixed UTC+4, no daylight saving.** Reuse
  `src/lib/eventFormat.js` (`clubDateTimeInputs`, `clubWallTimeToUtc`,
  `CLUB_TIME_ZONE`) — never hand-roll the offset.
- **Event `type` is exactly one of `match`, `training`, `social`** (`TYPES` in
  `src/screens/EventForm.jsx`). Any other value or a null `starts_at` never
  locks (fail-open).
- **`db:check` runs against PRODUCTION with rollback.** Every `db/tests/*.sql`
  harness must `begin;` … `rollback;`, never `commit;`, and contain at least
  one `raise exception`. It executes via `node-postgres` `client.query`, so
  psql meta-commands like `\i` do **not** work — inline any DDL.
- **The production migration + the Netlify deploy (15 credits) are gated on
  Jay's explicit yes** and are NOT part of the automated task loop. A stop hook
  asking is not Jay asking.
- **Changelog:** never cite your own branch SHA (squash-merge destroys it); let
  the next PR cite the squash SHA. `docs:check` allows the changelog to be one
  commit behind.

---

### Task 1: Availability lock helper (pure, client-side)

**Files:**
- Create: `src/lib/availabilityLock.js`
- Test: `tests/availabilityLock.test.js`

**Interfaces:**
- Consumes: `clubDateTimeInputs`, `clubWallTimeToUtc` from `src/lib/eventFormat.js`.
- Produces:
  - `availabilityLockInstant(event) → Date | null` — UTC instant self-service
    closes, or `null` if the event never locks.
  - `isAvailabilitySelfLocked(event, now = new Date()) → boolean`.

- [ ] **Step 1: Write the failing test** — `tests/availabilityLock.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { availabilityLockInstant, isAvailabilitySelfLocked } from '../src/lib/availabilityLock.js'

// Abu Dhabi is UTC+4, no DST, so 00:00 club time is 20:00Z the previous day.
describe('availabilityLockInstant', () => {
  it('locks a match at 00:00 Abu Dhabi five days before the event date', () => {
    // Match 2026-09-13 16:00 Abu Dhabi (= 12:00Z). 13 - 5 = the 8th.
    const event = { type: 'match', starts_at: '2026-09-13T12:00:00Z' }
    expect(availabilityLockInstant(event).toISOString()).toBe('2026-09-07T20:00:00.000Z')
  })

  it('locks a training at 00:00 Abu Dhabi one day before the event date', () => {
    // Training 2026-09-09 18:00 Abu Dhabi (= 14:00Z). 9 - 1 = the 8th.
    const event = { type: 'training', starts_at: '2026-09-09T14:00:00Z' }
    expect(availabilityLockInstant(event).toISOString()).toBe('2026-09-07T20:00:00.000Z')
  })

  it('never locks a social', () => {
    expect(availabilityLockInstant({ type: 'social', starts_at: '2026-09-09T14:00:00Z' })).toBeNull()
  })

  it('never locks an unknown type or a missing start', () => {
    expect(availabilityLockInstant({ type: 'festival', starts_at: '2026-09-09T14:00:00Z' })).toBeNull()
    expect(availabilityLockInstant({ type: 'match', starts_at: null })).toBeNull()
  })

  it('resolves the club date from Abu Dhabi wall time, not UTC', () => {
    // 2026-09-13T21:00Z is 2026-09-14 01:00 Abu Dhabi — club date is the 14th.
    // 14 - 5 = the 9th; 00:00 AD = 20:00Z on the 8th.
    const event = { type: 'match', starts_at: '2026-09-13T21:00:00Z' }
    expect(availabilityLockInstant(event).toISOString()).toBe('2026-09-08T20:00:00.000Z')
  })
})

describe('isAvailabilitySelfLocked', () => {
  const match = { type: 'match', starts_at: '2026-09-13T12:00:00Z' } // locks 2026-09-07T20:00Z
  it('is open just before the cutoff', () => {
    expect(isAvailabilitySelfLocked(match, new Date('2026-09-07T19:59:00Z'))).toBe(false)
  })
  it('is locked at and after the cutoff', () => {
    expect(isAvailabilitySelfLocked(match, new Date('2026-09-07T20:00:00Z'))).toBe(true)
    expect(isAvailabilitySelfLocked(match, new Date('2026-09-10T00:00:00Z'))).toBe(true)
  })
  it('never locks a social', () => {
    const social = { type: 'social', starts_at: '2026-09-13T12:00:00Z' }
    expect(isAvailabilitySelfLocked(social, new Date('2026-09-13T11:00:00Z'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:related -- tests/availabilityLock.test.js`
Expected: FAIL — `availabilityLock.js` does not exist / functions undefined.

- [ ] **Step 3: Write the implementation** — `src/lib/availabilityLock.js`:

```js
import { clubDateTimeInputs, clubWallTimeToUtc } from './eventFormat.js'

// Self-service availability closes a fixed number of CALENDAR DAYS before the
// event, measured in Abu Dhabi wall time (CLUB_TIME_ZONE). Matches close
// furthest out — a match squad is the hardest list to rebuild late — training
// the day before, socials never. Staff are never subject to this; the check is
// only ever asked about a parent/player editing their own child.
const LOCK_DAYS = { match: 5, training: 1 }

/**
 * The UTC instant at which self-service editing closes for this event, or null
 * when it never closes (a social, an unknown type, or an event with no start).
 */
export function availabilityLockInstant(event) {
  const days = LOCK_DAYS[event?.type]
  if (days == null) return null

  const startsAt = event?.starts_at ? new Date(event.starts_at) : null
  if (!startsAt || Number.isNaN(startsAt.getTime())) return null

  // The event's own calendar date in club time, then N days earlier.
  const { date } = clubDateTimeInputs(startsAt)
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day - days))
  const lockDate =
    `${shifted.getUTCFullYear()}-` +
    `${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(shifted.getUTCDate()).padStart(2, '0')}`

  // 00:00 Abu Dhabi on that day, expressed as a real instant — the same
  // wall-clock -> UTC path the event form writes starts_at with.
  const iso = clubWallTimeToUtc(lockDate, '00:00')
  return iso ? new Date(iso) : null
}

/** True when self-service editing is closed for this event at `now`. */
export function isAvailabilitySelfLocked(event, now = new Date()) {
  const instant = availabilityLockInstant(event)
  return instant != null && now.getTime() >= instant.getTime()
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:related -- tests/availabilityLock.test.js`
Expected: PASS — all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/availabilityLock.js tests/availabilityLock.test.js
git commit -m "feat(availability): calendar-day self-edit lock helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `clearAvailability` data function + harness stub

**Files:**
- Modify: `src/data/availability.js` (add `clearAvailability`, after `setAvailability` ~L121)
- Modify: `harness/stubs/availability.js` (add matching `clearAvailability`, after `setAvailability` ~L74)
- Test: `tests/availability-clear-data.test.js`

**Interfaces:**
- Produces: `clearAvailability(eventId, playerId) → Promise<row[]>` — deletes the
  `(event_id, player_id)` row, returns the deleted rows (`[]` when RLS refused
  or the row was already gone), throws on a real error or a missing id.

- [ ] **Step 1: Write the failing test** — `tests/availability-clear-data.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit test for clearAvailability in src/data/availability.js. The supabase
// client is mocked; this proves the SHAPE of the delete call, not the RLS that
// governs it (that is db/tests/rls-availability-equivalence.sql).
vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '../src/lib/supabase.js'
import { clearAvailability } from '../src/data/availability.js'

// A chainable builder that records calls and resolves via `.then`, matching the
// pattern in tests/messages-data.test.js.
function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['delete', 'eq', 'select']) {
    b[name] = vi.fn((...args) => {
      ;(calls[name] ??= []).push(args)
      return b
    })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => supabase.from.mockReset())

describe('clearAvailability', () => {
  it('deletes the (event, player) row and returns the removed rows', async () => {
    const { b, calls } = builder({ data: [{ id: 'a1' }], error: null })
    supabase.from.mockReturnValue(b)

    const out = await clearAvailability('e-1', 'p-ana')

    expect(supabase.from).toHaveBeenCalledWith('availability')
    expect(calls.delete).toHaveLength(1)
    expect(calls.eq).toEqual([['event_id', 'e-1'], ['player_id', 'p-ana']])
    expect(out).toEqual([{ id: 'a1' }])
  })

  it('returns [] when the delete matched nothing (RLS refused or already gone)', async () => {
    const { b } = builder({ data: [], error: null })
    supabase.from.mockReturnValue(b)
    expect(await clearAvailability('e-1', 'p-ana')).toEqual([])
  })

  it('throws on a real PostgREST error', async () => {
    const { b } = builder({ data: null, error: new Error('boom') })
    supabase.from.mockReturnValue(b)
    await expect(clearAvailability('e-1', 'p-ana')).rejects.toThrow('boom')
  })

  it('throws without both ids, before touching supabase', async () => {
    await expect(clearAvailability('', 'p')).rejects.toThrow(/both an event id and a player id/)
    await expect(clearAvailability('e', '')).rejects.toThrow(/both an event id and a player id/)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:related -- tests/availability-clear-data.test.js`
Expected: FAIL — `clearAvailability` is not exported.

- [ ] **Step 3: Add `clearAvailability` to `src/data/availability.js`** (after `setAvailability`, at end of file):

```js
/**
 * Clears one player's availability for one event by deleting the
 * (event_id, player_id) row — "No response" is the absence of a row, so a
 * delete is how a status is unset. Returns the deleted rows.
 *
 * A delete that matches no visible row returns [] whether RLS refused it (the
 * self-edit lock is closed, or the caller may not edit this player) or the row
 * was already gone. The two are indistinguishable from the row count and the
 * desired end state — no row — holds either way, so this does not throw on []:
 * the caller (Availability.jsx) reconciles an empty result by refetching rather
 * than optimistically showing a removal the database may not have made.
 */
export async function clearAvailability(eventId, playerId) {
  if (!eventId || !playerId) {
    throw new Error('clearAvailability needs both an event id and a player id.')
  }

  const { data, error } = await supabase
    .from('availability')
    .delete()
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .select()

  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 4: Add the matching stub to `harness/stubs/availability.js`** (after `setAvailability`, at end of file):

```js
export async function clearAvailability(eventId, playerId) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'delete', table: 'availability', payload: { event_id: eventId, player_id: playerId } })
  // A non-empty return so the sheet drops the row optimistically in the harness.
  return [{ id: `${eventId}-${playerId}`, event_id: eventId, player_id: playerId }]
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm run test:related -- tests/availability-clear-data.test.js`
Expected: PASS — 4 assertions green.

- [ ] **Step 6: Commit**

```bash
git add src/data/availability.js harness/stubs/availability.js tests/availability-clear-data.test.js
git commit -m "feat(availability): clearAvailability deletes a player's RSVP row

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the sheet — toggle-to-clear and the lock affordance

**Files:**
- Modify: `src/screens/Availability.jsx`
- Modify: `tests/availability.test.jsx`

**Interfaces:**
- Consumes: `isAvailabilitySelfLocked` (Task 1), `clearAvailability` (Task 2).

- [ ] **Step 1: Add the failing screen tests** — edit `tests/availability.test.jsx`.

  (a) Register a `clearAvailability` mock. Add a declaration beside the others
  (after L18 `const setAvailabilityMock = vi.fn()`):

```js
const clearAvailabilityMock = vi.fn()
```

  Add it to the `vi.mock('../src/data/availability.js', …)` block (after the
  `setAvailability` line):

```js
  clearAvailability: (...args) => clearAvailabilityMock(...args),
```

  Give it a default in `beforeEach` (after the `setAvailabilityMock` default):

```js
  clearAvailabilityMock.mockResolvedValue([{ id: 'a-1' }])
```

  Add `waitFor` to the Testing Library import on L2:

```js
import { render, screen, within, act, waitFor } from '@testing-library/react'
```

  (b) **Bump the base `EVENT` far outside any lock window** so the existing
  parent-set tests still exercise an *open* window. Change L45:

```js
  starts_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
```

  A 20-day-out match locks 5 days before (≈ 15 days out) — comfortably open.

  (c) Add a locked-event fixture beside `EVENT` (after the `EVENT` object):

```js
// One day before a match: 5 days inside the lock window.
const LOCKED_MATCH = { ...EVENT, starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
```

  (d) Append a new describe block at the end of the file:

```js
describe('Availability — clear and lock', () => {
  it('clears a status when its already-selected button is clicked again', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    clearAvailabilityMock.mockResolvedValue([{ id: 'a1' }])
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(row).getByRole('button', { name: /^in$/i }))

    expect(clearAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-ana')
    expect(within(row).getByRole('button', { name: /^in$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('refetches instead of optimistically clearing when the delete removed nothing', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', event_id: 'e-1', player_id: 'p-ana', status: 'in' },
    ])
    clearAvailabilityMock.mockResolvedValue([])
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    const before = listAvailabilityMock.mock.calls.length

    await user.click(within(row).getByRole('button', { name: /^in$/i }))

    await waitFor(() => expect(listAvailabilityMock.mock.calls.length).toBeGreaterThan(before))
  })

  it('locks a parent out inside the window: disabled buttons, a notice, no write', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup({ event: LOCKED_MATCH })

    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    const inBtn = within(tomRow).getByRole('button', { name: /^in$/i })

    expect(inBtn).toBeDisabled()
    expect(screen.getByText(/availability is closed/i)).toBeInTheDocument()

    await user.click(inBtn)
    expect(setAvailabilityMock).not.toHaveBeenCalled()
    expect(clearAvailabilityMock).not.toHaveBeenCalled()
  })

  it('never locks a coach, even inside the window', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    const { user } = setup({ event: LOCKED_MATCH })

    await screen.findByText('Ana Silva')
    const row = screen.getByText('Ana Silva').closest('li')
    const inBtn = within(row).getByRole('button', { name: /^in$/i })

    expect(inBtn).not.toBeDisabled()
    await user.click(inBtn)
    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-ana', 'in')
  })
})
```

- [ ] **Step 2: Run the screen tests and watch the new ones fail**

Run: `npm run test:related -- tests/availability.test.jsx`
Expected: FAIL — no clear-on-re-click, no disabled/locked state, no notice.

- [ ] **Step 3: Edit `src/screens/Availability.jsx`.**

  (a) Extend the imports (L5 and L8-area). Change the data import and add the lock helper:

```js
import { listAvailability, setAvailability, clearAvailability, subscribeAvailability } from '../data/availability.js'
```

```js
import { isAvailabilitySelfLocked } from '../lib/availabilityLock.js'
```

  (b) Replace `StatusButtons` (L51-76) so a pressed button clears:

```jsx
function StatusButtons({ status, disabled, onSet, onClear }) {
  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label="Set availability">
      {STATUSES.map((option) => {
        const pressed = status === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={pressed}
            onClick={() => (pressed ? onClear() : onSet(option.value))}
            className={[
              // Task 22 fix: these three toggle buttons had no focus-visible
              // ring at all — a real gap the brief's "focus rings are already
              // everywhere" claim didn't hold for. Same convention app-wide.
              'rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
              pressed ? STATUS_ON[option.value] : STATUS_OFF,
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
```

  (c) Replace `PlayerRow` (L78-100) to carry `locked` and `onClear`:

```jsx
function PlayerRow({ player, status, editable, locked, saving, onSet, onClear }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-[12px] font-extrabold tracking-[.5px] text-white"
          aria-hidden="true"
        >
          {initials(player.full_name)}
        </span>
        <span className="truncate text-[14.5px] font-bold text-ink">{player.full_name}</span>
      </div>

      {editable ? (
        <StatusButtons
          status={status}
          disabled={saving || locked}
          onSet={(next) => onSet(player.id, next)}
          onClear={() => onClear(player.id)}
        />
      ) : (
        <span className="shrink-0 text-[13px] font-bold text-ink-muted">
          {status ? STATUS_LABELS[status] : 'No response'}
        </span>
      )}
    </li>
  )
}
```

  (d) Add `handleClear` inside the `Availability` component, right after
  `handleSet` (after L195):

```jsx
  function handleClear(playerId) {
    setSavingPlayerId(playerId)
    setSaveError(null)
    clearAvailability(event.id, playerId)
      .then((removed) => {
        if (removed.length > 0) {
          // A genuine delete — drop the row locally, same optimism as handleSet.
          setRows((current) => current.filter((row) => row.player_id !== playerId))
        } else {
          // Nothing was deleted: RLS refused (a boundary race against the lock)
          // or the row was already gone. Refetch the truth rather than showing a
          // removal the database may not have made.
          setReloadToken((token) => token + 1)
        }
      })
      .catch((err) => setSaveError(err))
      .finally(() => setSavingPlayerId(null))
  }
```

  (e) Compute the self-lock once, alongside `canOverrideAll`/`myPlayerIds`
  (after L110). Staff (`canOverrideAll`) are never locked:

```jsx
  const selfLocked = !canOverrideAll && isAvailabilitySelfLocked(event)
```

  (f) Add a lock notice under the header. Insert it just before the
  `{saveError && (…)}` block (before L209):

```jsx
      {selfLocked && myPlayerIds.size > 0 && (
        <p className="mb-3.5 rounded-[11px] bg-surface-mute px-3 py-2.5 text-[13px] font-semibold text-ink-muted">
          Availability is closed for this {event.type === 'match' ? 'match' : 'session'} —
          changes lock {event.type === 'match' ? 'five days before a match' : 'the day before training'}.
          Ask a coach if it needs to change.
        </p>
      )}
```

  (g) Pass `locked` and `onClear` into `PlayerRow` in the list map (L250-257):

```jsx
                <PlayerRow
                  key={player.id}
                  player={player}
                  status={statusByPlayer.get(player.id) ?? null}
                  editable={canOverrideAll || myPlayerIds.has(player.id)}
                  locked={selfLocked}
                  saving={savingPlayerId === player.id}
                  onSet={handleSet}
                  onClear={handleClear}
                />
```

- [ ] **Step 4: Run the screen tests and watch them pass**

Run: `npm run test:related -- tests/availability.test.jsx`
Expected: PASS — new block green, and the existing coach/parent/realtime tests
still pass (the base `EVENT` is now an open 20-day-out match).

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`
Expected: PASS — whole suite green.

```bash
git add src/screens/Availability.jsx tests/availability.test.jsx
git commit -m "feat(availability): click-to-clear a status, and show the self-edit lock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: The RLS migration

**Files:**
- Create: `db/migrations/20260827_availability_self_lock.sql`

**Interfaces:**
- Produces: `private.availability_self_editable(uuid) → boolean`, consumed by
  the three `avail write` policies and mirrored by Task 5's harness.

This task writes the canonical migration. It is **not** applied here — it is
proven by Task 5's harness (which installs the same DDL inside a rolled-back
transaction) and applied to production only later, on Jay's yes.

- [ ] **Step 1: Write the migration** — `db/migrations/20260827_availability_self_lock.sql`:

```sql
-- ⚠️ APPLIES TO PRODUCTION as `availability_self_lock`.
--
-- Parents/players may now DELETE (clear) their own child's availability — the
-- 9-Aug 2026 staff-only-delete rule (20260809_scale_indexes_and_availability_
-- policy_merge.sql) is REVERSED — but every self-write (insert, update, delete)
-- is now gated on a lock window: self-service closes a fixed number of CALENDAR
-- DAYS before the event, in Abu Dhabi time. Matches close 5 days out, training
-- 1 day out, socials never. Staff (can_edit_team) are never locked.
--
-- Design: claude/plans/2026-08-27-availability-clear-and-lock-window.md
-- Decision: claude/decisions/2026-08-27-availability-self-edit-lock.md
-- Anchor:   db/tests/rls-availability-equivalence.sql (repointed alongside).

-- ── The time rule, shared by all three write policies ──────────────────────
create or replace function private.availability_self_editable(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when e.starts_at is null then true
    when e.type not in ('match','training') then true
    else now() < (
      date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
      - make_interval(days => case e.type
                                when 'match' then 5
                                when 'training' then 1
                              end)
    ) at time zone 'Asia/Dubai'
  end
  from public.events e
  where e.id = p_event_id
$$;

revoke all on function private.availability_self_editable(uuid) from public;
-- ⚠️ RE-GRANT to authenticated — mandatory. `revoke all from public` strips the
-- default PUBLIC execute grant, and every private helper used inside an RLS
-- policy re-grants execute to authenticated or the policy raises "permission
-- denied for function" for a parent/coach. `anon` needs nothing (no USAGE on
-- private). Same pattern as can_edit_team / is_own_player.
grant execute on function private.availability_self_editable(uuid) to authenticated;

-- ── The three write policies. Staff arm unchanged; the self arm is now
--    lock-gated, and DELETE gains the self arm it never had. ────────────────
drop policy "avail write insert" on public.availability;
drop policy "avail write update" on public.availability;
drop policy "avail write delete" on public.availability;

create policy "avail write insert" on public.availability for insert with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

create policy "avail write update" on public.availability for update using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
) with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

create policy "avail write delete" on public.availability for delete using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

-- ── Verify (a migration that changed nothing must fail, not pass) ───────────
-- Structural only. The behaviour of the time rule is proven by the harness in
-- db/tests/rls-availability-equivalence.sql, which exercises it against real
-- callers and rolls back.
do $$
declare n_pol int;
begin
  select count(*) into n_pol from pg_policies
   where schemaname = 'public' and tablename = 'availability';
  if n_pol <> 4 then
    raise exception 'VERIFY: expected 4 policies on availability, found %', n_pol;
  end if;

  if to_regprocedure('private.availability_self_editable(uuid)') is null then
    raise exception 'VERIFY: helper private.availability_self_editable(uuid) is missing';
  end if;
end $$;
```

- [ ] **Step 2: Sanity-check the SQL parses** (no DB change — dry parse):

Run: `node -e "const s=require('fs').readFileSync('db/migrations/20260827_availability_self_lock.sql','utf8'); if(!/create or replace function private\.availability_self_editable/.test(s)||/\bcommit\b/i.test(s)) throw new Error('migration shape wrong'); console.log('shape ok, '+s.length+' bytes')"`
Expected: `shape ok, …` — no accidental `commit`, helper present.

- [ ] **Step 3: Commit** (docs:check first — it guards the grants capture; this
  migration grants on no table, so nothing to capture):

Run: `npm run docs:check`
Expected: all checks pass.

```bash
git add db/migrations/20260827_availability_self_lock.sql
git commit -m "feat(db): availability self-edit lock window + parent clear (migration)

Not yet applied to production. Reverses staff-only-delete; gates self-writes on
a calendar-day lock (5d matches, 1d training, none socials).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Repoint the RLS rot-anchor and prove the migration against production

**Files:**
- Modify: `db/tests/rls-availability-equivalence.sql`

The harness runs inside `begin; … rollback;`. It will now **install the new
helper + policies inside that transaction** (a deliberate copy of the migration
— the migration file is canonical) and drive the parent across timed event
configurations, proving the lock against real production data without applying
anything. Rule 7: the anchor is repointed, never deleted.

**Prerequisite:** a working connection string in `.env` as `SUPABASE_DB_URL`
(see `claude/runbooks/db-harnesses.md`), and `npm install --include=dev` (for
`pg`).

- [ ] **Step 1: Insert the policy-install block.** After the grants (after L162,
  `grant select on fx to authenticated, anon;`) and before the probe function
  (L164 `-- ── The probe…`), add:

```sql
-- ── Install the NEW policy set inside this rolled-back transaction ─────────
-- ⚠️ This is a deliberate copy of db/migrations/20260827_availability_self_lock.sql.
-- The migration is the canonical source; this makes the harness assert the new
-- world whether or not production has the migration yet, so it proves the logic
-- BEFORE the migration is applied and stays green AFTER. All of it rolls back.
create or replace function private.availability_self_editable(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public, private
as $$
  select case
    when e.starts_at is null then true
    when e.type not in ('match','training') then true
    else now() < (
      date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
      - make_interval(days => case e.type when 'match' then 5 when 'training' then 1 end)
    ) at time zone 'Asia/Dubai'
  end
  from public.events e where e.id = p_event_id
$$;
-- Mirror the migration's grant state so the harness reproduces production: strip
-- the default PUBLIC execute grant, re-grant to authenticated. Without this the
-- harness (a fresh create) would keep the default PUBLIC grant and could never
-- catch a missing re-grant in the real migration.
revoke all on function private.availability_self_editable(uuid) from public;
grant execute on function private.availability_self_editable(uuid) to authenticated;

drop policy "avail write insert" on public.availability;
drop policy "avail write update" on public.availability;
drop policy "avail write delete" on public.availability;

create policy "avail write insert" on public.availability for insert with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);
create policy "avail write update" on public.availability for update using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
) with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);
create policy "avail write delete" on public.availability for delete using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

-- Point the fixture event's timing where each probe batch needs it. Runs as the
-- connection owner (RLS-exempt), and rolls back with everything else.
create function pg_temp.configure(_type text, _in interval) returns void
language plpgsql as $fn$
begin
  update public.events e set type = _type, starts_at = now() + _in
    from fx where e.id = fx.event_id;
end $fn$;
```

- [ ] **Step 2: Replace the probe calls + assertion.** Replace lines from the
  seven `select pg_temp.probe(...)` calls (L233-239) through the end of the main
  assertion `do $$ … end $$;` block (L285) with the config-driven version below.
  Leave the probe function itself (L164-231) and the read self-test (L288-334)
  untouched.

```sql
-- ── Drive the matrix under timed configurations ───────────────────────────
-- Labels are "<config>/<caller>". Margins clear the calendar-day boundary by
-- well over a day so the pass/fail does not hinge on the hour the test runs.

-- OPEN: a match 8 days out (locks ~3 days out — future).
select pg_temp.configure('match', interval '8 days');
select pg_temp.probe('open/3_parent_active', '0a000000-0000-4000-8000-000000000003');
select pg_temp.probe('open/1_coach_active',  '0a000000-0000-4000-8000-000000000001');
select pg_temp.probe('open/6_admin',         '0a000000-0000-4000-8000-000000000006');

-- LOCKED: a match 2 days out (locked ~3 days ago).
select pg_temp.configure('match', interval '2 days');
select pg_temp.probe('locked/3_parent_active', '0a000000-0000-4000-8000-000000000003');
select pg_temp.probe('locked/1_coach_active',  '0a000000-0000-4000-8000-000000000001');
select pg_temp.probe('locked/6_admin',         '0a000000-0000-4000-8000-000000000006');

-- LOCKED training: 4 hours out (well inside the 1-day window).
select pg_temp.configure('training', interval '4 hours');
select pg_temp.probe('trainlocked/3_parent_active', '0a000000-0000-4000-8000-000000000003');

-- SOCIAL: 2 hours out, never locks.
select pg_temp.configure('social', interval '2 hours');
select pg_temp.probe('social/3_parent_active', '0a000000-0000-4000-8000-000000000003');

select * from _m order by caller;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. `npm run db:check` throws on a SQL error and nothing else,
--  so this is the thing that fails when the lock is wrong.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  -- A parent may fully self-edit an OPEN match (set, change, and clear).
  select * into r from _m where caller = 'open/3_parent_active';
  if not (r.ins = 'ALLOWED' and r.upd = 'ALLOWED' and r.del = 'ALLOWED') then
    raise exception 'LOCK: parent should self-edit an OPEN match — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;

  -- Inside a match window every self-write is frozen. The clear (del) and the
  -- change (upd) must report NO ROWS; the insert must not be ALLOWED.
  select * into r from _m where caller = 'locked/3_parent_active';
  if not (r.upd = 'NO ROWS' and r.del = 'NO ROWS' and r.ins <> 'ALLOWED') then
    raise exception 'LOCK: parent should be FROZEN on a LOCKED match — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;

  -- Staff are never locked, in either configuration.
  select * into r from _m where caller = 'locked/1_coach_active';
  if not (r.ins = 'ALLOWED' and r.upd = 'ALLOWED' and r.del = 'ALLOWED') then
    raise exception 'LOCK: coach must never be locked — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;
  select * into r from _m where caller = 'locked/6_admin';
  if not (r.ins = 'ALLOWED' and r.upd = 'ALLOWED' and r.del = 'ALLOWED') then
    raise exception 'LOCK: admin must never be locked — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;

  -- Training locks the day before, so 4 hours out is frozen.
  select * into r from _m where caller = 'trainlocked/3_parent_active';
  if not (r.upd = 'NO ROWS' and r.del = 'NO ROWS') then
    raise exception 'LOCK: parent should be FROZEN on a LOCKED training — got upd=% del=%', r.upd, r.del;
  end if;

  -- A social never locks.
  select * into r from _m where caller = 'social/3_parent_active';
  if not (r.ins = 'ALLOWED' and r.upd = 'ALLOWED' and r.del = 'ALLOWED') then
    raise exception 'LOCK: parent should always edit a SOCIAL — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;

  raise notice 'LOCK MATRIX: parent frozen inside match+training windows, free on social, staff never locked.';
end $$;

-- ── ⚠️ SELF-TEST — invert the helper and prove the matrix notices ──────────
-- The discriminating fault: flip the comparison so the window is inverted. A
-- LOCKED match must then read as editable. If the probe still says frozen, the
-- assertion above is decoration.
do $$
declare r record;
begin
  create or replace function private.availability_self_editable(p_event_id uuid)
  returns boolean language sql stable security definer set search_path = public, private
  as $inner$
    select case
      when e.starts_at is null then true
      when e.type not in ('match','training') then true
      else now() >= (
        date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
        - make_interval(days => case e.type when 'match' then 5 when 'training' then 1 end)
      ) at time zone 'Asia/Dubai'
    end
    from public.events e where e.id = p_event_id
  $inner$;

  delete from _m;
  perform pg_temp.configure('match', interval '2 days');   -- still "locked" timing
  perform pg_temp.probe('inverted/3_parent_active', '0a000000-0000-4000-8000-000000000003');

  select * into r from _m where caller = 'inverted/3_parent_active';
  if not (r.upd = 'ALLOWED' and r.del = 'ALLOWED') then
    raise exception 'SELF-TEST FAILED — inverting the lock did not free a frozen parent (upd=% del=%). The matrix is not testing the window.', r.upd, r.del;
  end if;
  raise notice 'SELF-TEST PASSED — inverting the lock freed the frozen parent, as it must.';
end $$;
```

  (The read self-test at L288-334 and the final `rollback;` stay as they are;
  the read self-test only reads `sel`, which the lock does not touch.)

- [ ] **Step 3: Update the file's header comment.** The header (L1-95) documents
  the old matrix, including the "parent DELETE = NO ROWS is deliberate" note at
  L87-93. Add a dated block at the top recording the reversal:

```sql
-- ⚠️ REPOINTED 27 Aug 2026. Row 3's DELETE = NO ROWS is NO LONGER the whole
-- truth: a parent MAY now clear their own child's row (and set/change it), but
-- only OUTSIDE the self-edit lock window (5 calendar days before a match, 1
-- before training, never for a social — Asia/Dubai). Inside the window every
-- self-write is frozen and reports NO ROWS / DENIED, which is what the old
-- staff-only rule looked like from here. Staff are never locked. This harness
-- now drives the fixture event's type/timing (pg_temp.configure) and asserts
-- both sides of each boundary. Migration: db/migrations/20260827_availability_
-- self_lock.sql. Decision: claude/decisions/2026-08-27-availability-self-edit-lock.md.
```

- [ ] **Step 4: Run the harness and watch it pass**

Run: `npm run db:check -- availability`
Expected: `ok  rls-availability-equivalence.sql`, the printed `_m` rows, and
both notices — `LOCK MATRIX: …` and `SELF-TEST PASSED — …`. `All harnesses passed.`

- [ ] **Step 5: Prove it can fail** (rule 6 — a check that cannot fail is not a
  check). Temporarily break the installed policy: in the install block, change
  the delete policy's self arm to `and false` so a parent can never clear, then:

Run: `npm run db:check -- availability`
Expected: FAIL — `LOCK: parent should self-edit an OPEN match — got … del=NO ROWS`.
**Revert the `and false`** and re-run Step 4 to confirm green again.

- [ ] **Step 6: Commit**

```bash
git add db/tests/rls-availability-equivalence.sql
git commit -m "test(db): repoint availability RLS anchor for the self-edit lock

Parent may now clear/set/change outside the window and is frozen inside it;
staff never locked. Proven against production data via a rolled-back tx.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Documentation trail

**Files:**
- Create: `claude/decisions/2026-08-27-availability-self-edit-lock.md`
- Modify: `db/migrations/20260809_scale_indexes_and_availability_policy_merge.sql` (tombstone pointer)
- Modify: `claude/changelog.md`

- [ ] **Step 1: Write the decision record** — `claude/decisions/2026-08-27-availability-self-edit-lock.md`. It MUST carry the argument that was made *against* letting parents delete (from the 9-Aug migration), so it is not re-litigated blind:

```markdown
# Parents may clear availability — but self-edits lock before the event

**27 Aug 2026.** Reverses the 9 Aug 2026 decision that DELETE on `availability`
is staff-only, and replaces it with a time-lock that bounds every self-edit.

## What changed
A parent/player may now set, change, AND clear (delete) their own child's
availability — until a cutoff, after which staff alone can adjust it. The cutoff
is a calendar-day boundary in Abu Dhabi time: 5 days before a match, 1 day
before training, never for a social.

## The argument AGAINST (from 9 Aug, preserved so it is not re-made blind)
The 9-Aug migration made DELETE staff-only on the reasoning that "a parent
changes their answer, they do not remove the row" — a set/change is a real
signal, a delete is ambiguous (did they mean "no" or "I haven't decided"?), and
"No response" already exists for the undecided. That reasoning still holds for
an OPEN event; what changed is that a hard lock now exists, so the risk it
guarded against (a parent silently emptying a row a coach was relying on) is
bounded by the window instead of by forbidding delete outright.

## Why the lock
Coaches plan off the squad list; late changes wreck it. A fixed, visible
deadline is what the club actually wanted — not a permanent ban on one verb.

## Where it lives
RLS is the gate (`private.availability_self_editable`, shared by the three
`avail write` policies — `db/migrations/20260827_availability_self_lock.sql`);
the sheet mirrors it for the affordance only. Anchor:
`db/tests/rls-availability-equivalence.sql`.

## Rejected
UI-only lock (bypassable); rolling-hours cutoff (Jay chose calendar days);
a stored per-event `locks_at` column (YAGNI until per-event overrides are asked
for).
```

- [ ] **Step 2: Add a tombstone pointer** to the 9-Aug migration. Under its
  DELETE-policy comment (the `avail write delete` block, ~L142-148 of
  `db/migrations/20260809_scale_indexes_and_availability_policy_merge.sql`), add:

```sql
-- ⚠️ SUPERSEDED 27 Aug 2026. DELETE is no longer staff-only: a parent may clear
-- their own child's row, but only outside a self-edit lock window, and the same
-- window now also gates their insert/update. This block's "a parent changes
-- their answer, they do not remove the row" reasoning is preserved in
-- claude/decisions/2026-08-27-availability-self-edit-lock.md. See
-- db/migrations/20260827_availability_self_lock.sql for the current policy.
```

- [ ] **Step 3: Add a changelog entry** at the top of `claude/changelog.md`,
  **without a SHA** (this branch's SHA dies at squash-merge; the next PR cites
  the real one — see the changelog rules in `CLAUDE.md`). Match the file's
  existing entry format:

```markdown
- Availability: a parent/player can now clear their child's RSVP (click the
  selected status again), and self-service editing locks a calendar day before
  the event — 5 days for matches, 1 for training, never for socials — enforced
  in RLS. Staff are never locked. Reverses the 9-Aug staff-only-delete rule.
```

- [ ] **Step 4: Run docs:check, then commit**

Run: `npm run docs:check`
Expected: all checks pass (new decision file resolves; plan status lines ok;
changelog coverage ok with the un-SHA'd entry).

```bash
git add claude/decisions/2026-08-27-availability-self-edit-lock.md db/migrations/20260809_scale_indexes_and_availability_policy_merge.sql claude/changelog.md
git commit -m "docs: record the availability self-edit lock decision + tombstone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Rollout (NOT automated — Jay's explicit yes at each gate)

1. `npm test` green; `npm run db:check -- availability` green (Task 5).
2. **Show Jay the full diff and the migration SQL.** Get an explicit yes.
3. **Apply `db/migrations/20260827_availability_self_lock.sql` to production**
   (Supabase SQL editor, or the `apply_migration` MCP tool) — a policy change on
   a live table. Then re-run `npm run db:check -- availability` against the now-
   migrated production and confirm it is still green (it installs its own copy in
   a tx, so it stays green; the point is to confirm production drift is clean).
4. **Merge to `main`** → one Netlify deploy (**15 credits**). Verify the deploy
   id moves (this is a real code change, not docs-only).
5. **Verify live** (`claude/runbooks` e2e-roles): as a parent test account,
   confirm a near match/training is locked (disabled buttons + notice) and a
   distant one is open; clear a status and confirm it returns to "No response";
   as a coach, confirm no lock and that override still works.

## Self-review notes

- **Spec coverage:** clear-by-delete (Tasks 2,3), lock rule (Task 1 helper +
  Task 4 RLS), staff-never-locked (Tasks 3,5), UI affordance + notice (Task 3),
  repointed rot-anchor (Task 5), decision/tombstone/changelog (Task 6),
  fail-open edge cases (Task 1 tests + migration helper). All mapped.
- **Type consistency:** `availabilityLockInstant`/`isAvailabilitySelfLocked`,
  `clearAvailability(eventId, playerId) → row[]`, and the `locked`/`onClear`
  PlayerRow props are named identically everywhere they appear.
- **Boundary margins** in Task 5 (8d/2d/4h/2h) clear the calendar-day boundary
  by more than a day so the harness does not flake on the hour it runs.
```
