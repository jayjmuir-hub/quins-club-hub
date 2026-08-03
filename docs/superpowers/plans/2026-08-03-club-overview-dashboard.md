# Club Overview Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins, coaches, and age-group managers a new desktop-only "Overview" screen showing, across every team they're allowed to see: upcoming fixtures, RSVP status per fixture, and roster gaps.

**Architecture:** A new screen (`src/screens/Overview.jsx`) reachable from a new, desktop-only, role-gated nav item, following the exact data-scoping pattern every existing screen already uses (`visibleTeams()` from `src/lib/scope.js`). Two small additive data-access functions are needed (`listAvailabilityForEvents` and `listContactsForPlayers`); no database schema changes.

**Tech Stack:** React 18, Vite 5, Tailwind 3, React Router v6, Vitest + React Testing Library, Supabase JS client.

## Global Constraints

- No database/schema/RLS changes in this plan — everything is derivable from existing tables (see spec's Non-goals).
- "Age-group manager" reuses the existing `coach` role exactly — no new role, no new permission level.
- Desktop-only: nothing about the phone experience changes. Gate at the existing `desktop:` Tailwind breakpoint (`820px`, see `tailwind.config.js`).
- Follow the throw-on-error data-access convention used by every existing module in `src/data/` (never `{data, error}` tuples — throw on error, return `[]`/`null` for legitimate empty results).
- No player-count "target squad size" threshold — show real counts only (see spec's Non-goals).
- Activity feed is explicitly out of scope (Phase 2, separate spec later).
- Full spec: `docs/superpowers/specs/2026-08-03-club-overview-dashboard-design.md`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/data/availability.js` | Modify | Add `listAvailabilityForEvents(eventIds)` — bulk RSVP fetch for many fixtures in one query |
| `tests/availability.test.jsx` | Modify | Tests for the new function |
| `src/data/players.js` | Modify | Add `listContactsForPlayers(playerIds)` — bulk contact-presence fetch |
| `tests/player-format.test.js` or a new `tests/players-data.test.js` | Create | Tests for the new function (see Task 2 — existing player data tests live inline in other files; this plan creates a dedicated file since none currently covers `src/data/players.js` in isolation) |
| `src/screens/Overview.jsx` | Create | The new screen: three sections (fixtures, RSVP status, roster gaps), scoped by role |
| `tests/overview.test.jsx` | Create | Screen tests: scoping, rendering, empty/error states |
| `src/components/Nav.jsx` | Modify | Add an optional, role-gated, desktop-only "Overview" link |
| `tests/nav.test.jsx` | Modify | Cover the new conditional nav item without breaking existing 4-item assertions |
| `src/components/AppShell.jsx` | Modify | Compute the "can manage" boolean and pass it to `<Nav />` |
| `tests/app-shell.test.jsx` | Modify | Cover the new prop being computed and passed correctly |
| `src/App.jsx` | Modify | Add the `/overview` route |
| `harness/main.jsx` | Modify | Add harness scenarios for the browser-verification pass |
| `harness/stubs/availability.js` | Modify | Add a stub `listAvailabilityForEvents` matching the real function's shape |
| `harness/shoot-overview.mjs` | Create | Browser-verification script, modeled on `harness/shoot-dashboard.mjs` |

---

### Task 1: `listAvailabilityForEvents` bulk data-access function

**Files:**
- Modify: `src/data/availability.js`
- Test: `tests/availability.test.jsx`

**Interfaces:**
- Consumes: nothing new (uses the existing `supabase` client already imported at the top of `src/data/availability.js`).
- Produces: `listAvailabilityForEvents(eventIds: string[]): Promise<Array<{id, event_id, player_id, status}>>` — an empty array input returns `[]` without querying; a non-empty array does one `.in('event_id', eventIds)` query. Later tasks (Task 3) call this with the list of event ids returned by `listEvents(...)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/availability.test.jsx` (check the existing file's top-of-file mock setup first — it already mocks `../src/lib/supabase.js`'s `supabase` export with vi.fn() chains; follow that exact pattern for the new tests rather than introducing a second mocking approach):

```javascript
describe('listAvailabilityForEvents', () => {
  it('returns [] without querying when eventIds is an empty array', async () => {
    const rows = await listAvailabilityForEvents([])
    expect(rows).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('queries availability filtered to the given event ids', async () => {
    const fakeRows = [
      { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'in' },
      { id: 'a2', event_id: 'e2', player_id: 'p2', status: 'maybe' },
    ]
    const inMock = vi.fn().mockResolvedValue({ data: fakeRows, error: null })
    const selectMock = vi.fn(() => ({ in: inMock }))
    supabase.from.mockReturnValue({ select: selectMock })

    const rows = await listAvailabilityForEvents(['e1', 'e2'])

    expect(supabase.from).toHaveBeenCalledWith('availability')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(inMock).toHaveBeenCalledWith('event_id', ['e1', 'e2'])
    expect(rows).toEqual(fakeRows)
  })

  it('returns [] (not null) when the query resolves with null data', async () => {
    const inMock = vi.fn().mockResolvedValue({ data: null, error: null })
    supabase.from.mockReturnValue({ select: vi.fn(() => ({ in: inMock })) })

    const rows = await listAvailabilityForEvents(['e1'])

    expect(rows).toEqual([])
  })

  it('throws when the query errors', async () => {
    const queryError = new Error('network down')
    const inMock = vi.fn().mockResolvedValue({ data: null, error: queryError })
    supabase.from.mockReturnValue({ select: vi.fn(() => ({ in: inMock })) })

    await expect(listAvailabilityForEvents(['e1'])).rejects.toThrow('network down')
  })
})
```

Import `listAvailabilityForEvents` alongside the file's existing imports of `listAvailability`/`setAvailability`/etc. at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/availability.test.jsx`
Expected: FAIL — `listAvailabilityForEvents is not a function` (or `undefined is not a function`), since it doesn't exist yet.

- [ ] **Step 3: Implement the function**

Add to `src/data/availability.js`, directly below the existing `listAvailability(eventId)` function:

```javascript
/**
 * Lists availability rows across many events in one query — used by the
 * Overview screen, which needs RSVP counts for every upcoming fixture across
 * however many teams are in scope, not just one event at a time the way
 * listAvailability(eventId) does. One .in('event_id', ...) query rather than
 * one round trip per fixture, matching the same teamIds-array pattern
 * src/data/events.js's listEvents({teamIds}) and src/data/players.js's
 * listPlayers({teamIds}) already use.
 *
 * An empty eventIds array returns [] without querying — there is nothing to
 * ask about, and (matching the existing teamIds convention) an empty input
 * must never be read as "no filter, return everything".
 */
export async function listAvailabilityForEvents(eventIds) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return []

  const { data, error } = await supabase
    .from('availability')
    .select('*')
    .in('event_id', eventIds)
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/availability.test.jsx`
Expected: PASS, all tests in the file including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/data/availability.js tests/availability.test.jsx
git commit -m "feat: add listAvailabilityForEvents for bulk RSVP fetch across fixtures"
```

---

### Task 2: `listContactsForPlayers` bulk data-access function

**Files:**
- Modify: `src/data/players.js`
- Create: `tests/players-data.test.js`

**Interfaces:**
- Consumes: nothing new (existing `supabase` import already in `src/data/players.js`).
- Produces: `listContactsForPlayers(playerIds: string[]): Promise<Array<{player_id, phone, email}>>` — an empty array returns `[]` without querying. Task 3 uses this to compute, per team, how many players have no matching row (i.e. whose `player_id` is absent from the returned set) — the aggregation itself (set difference) happens in `Overview.jsx`, not in this function, matching the spec's "Open items" note that this is a screen-level concern.

- [ ] **Step 1: Write the failing tests**

Create `tests/players-data.test.js` (a new file — no existing test file covers `src/data/players.js`'s functions in isolation from a screen; `tests/player-form.test.jsx` and `tests/playerImport.test.js` test the form and the paste-parser respectively, not this module directly):

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '../src/lib/supabase'
import { listContactsForPlayers } from '../src/data/players.js'

vi.mock('../src/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listContactsForPlayers', () => {
  it('returns [] without querying when playerIds is an empty array', async () => {
    const rows = await listContactsForPlayers([])
    expect(rows).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('queries player_contacts filtered to the given player ids', async () => {
    const fakeRows = [
      { player_id: 'p1', phone: '+971500000000', email: 'a@example.com' },
    ]
    const inMock = vi.fn().mockResolvedValue({ data: fakeRows, error: null })
    const selectMock = vi.fn(() => ({ in: inMock }))
    supabase.from.mockReturnValue({ select: selectMock })

    const rows = await listContactsForPlayers(['p1', 'p2'])

    expect(supabase.from).toHaveBeenCalledWith('player_contacts')
    expect(selectMock).toHaveBeenCalledWith('player_id, phone, email')
    expect(inMock).toHaveBeenCalledWith('player_id', ['p1', 'p2'])
    expect(rows).toEqual(fakeRows)
  })

  it('returns [] (not null) when the query resolves with null data', async () => {
    const inMock = vi.fn().mockResolvedValue({ data: null, error: null })
    supabase.from.mockReturnValue({ select: vi.fn(() => ({ in: inMock })) })

    const rows = await listContactsForPlayers(['p1'])

    expect(rows).toEqual([])
  })

  it('throws when the query errors', async () => {
    const queryError = new Error('rls refused')
    const inMock = vi.fn().mockResolvedValue({ data: null, error: queryError })
    supabase.from.mockReturnValue({ select: vi.fn(() => ({ in: inMock })) })

    await expect(listContactsForPlayers(['p1'])).rejects.toThrow('rls refused')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/players-data.test.js`
Expected: FAIL — `listContactsForPlayers is not a function`.

- [ ] **Step 3: Implement the function**

Add to `src/data/players.js`, directly below the existing `getPlayerContact(playerId)` function:

```javascript
/**
 * Lists contact rows for many players in one query — used by the Overview
 * screen to compute, per team, how many players have no contact record at
 * all (a player id with no row in the returned set). Selects only the three
 * columns the caller needs (not '*') since this is an aggregate-presence
 * check, not a form load — src/screens/PlayerForm.jsx's per-player load via
 * getPlayerContact still uses '*' for its own different purpose.
 *
 * An empty playerIds array returns [] without querying, matching the same
 * convention as listPlayers({teamIds})/listEvents({teamIds}).
 */
export async function listContactsForPlayers(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) return []

  const { data, error } = await supabase
    .from('player_contacts')
    .select('player_id, phone, email')
    .in('player_id', playerIds)
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/players-data.test.js`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/players.js tests/players-data.test.js
git commit -m "feat: add listContactsForPlayers for roster-gap aggregation"
```

---

### Task 3: Overview screen

**Files:**
- Create: `src/screens/Overview.jsx`
- Test: `tests/overview.test.jsx`

**Interfaces:**
- Consumes:
  - `useMemberships()` from `src/lib/memberships.jsx` → `{ memberships, teams }`
  - `visibleTeams(memberships, teams)`, `isAdmin(memberships)`, `canEditTeam(memberships, teamId)` from `src/lib/scope.js`
  - `listEvents({ teamIds, from, to })` from `src/data/events.js` (existing — this task is the first caller to pass `from`/`to`)
  - `listAvailabilityForEvents(eventIds)` from `src/data/availability.js` (Task 1)
  - `listPlayers({ teamIds })` from `src/data/players.js` (existing)
  - `listContactsForPlayers(playerIds)` from `src/data/players.js` (Task 2)
  - `FixtureRow` from `src/components/FixtureRow.jsx`, `Card` from `src/components/Card.jsx`, `Empty` from `src/components/Empty.jsx`, `Spinner` from `src/components/Spinner.jsx`
  - `eventDate`, `clubToday` from `src/lib/eventFormat.js`
- Produces: default export `Overview` (a screen component, same shape as `Dashboard`/`Schedule`/`Roster`), used by Task 4's route wiring.

- [ ] **Step 1: Write the failing tests**

Create `tests/overview.test.jsx`. Follow the mocking pattern already established in `tests/schedule.test.jsx` / `tests/roster.test.jsx` (mock `src/lib/memberships.jsx`'s `useMemberships`, and mock the `src/data/*` modules this screen calls) — read one of those files first for the exact mock shape before writing this one, since the harness for membership/team fixtures is already established there and must not be duplicated with a different shape.

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Overview from '../src/screens/Overview.jsx'
import { useMemberships } from '../src/lib/memberships.jsx'
import { listEvents } from '../src/data/events.js'
import { listAvailabilityForEvents } from '../src/data/availability.js'
import { listPlayers, listContactsForPlayers } from '../src/data/players.js'

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: vi.fn(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: vi.fn(),
  subscribeEvents: vi.fn(() => () => {}),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailabilityForEvents: vi.fn(),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: vi.fn(),
  listContactsForPlayers: vi.fn(),
}))

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

function renderOverview() {
  return render(
    <MemoryRouter future={routerFuture}>
      <Overview />
    </MemoryRouter>,
  )
}

const ADMIN_MEMBERSHIPS = [{ id: 'm0', role: 'admin', team_id: null, player_id: null }]
const COACH_MEMBERSHIPS = [{ id: 'm1', role: 'coach', team_id: 't1', player_id: null }]
const TEAMS = [
  { id: 't1', name: 'U12 Boys', sort_order: 4 },
  { id: 't2', name: 'U14 Boys', sort_order: 6 },
]

beforeEach(() => {
  vi.clearAllMocks()
  listEvents.mockResolvedValue([])
  listAvailabilityForEvents.mockResolvedValue([])
  listPlayers.mockResolvedValue([])
  listContactsForPlayers.mockResolvedValue([])
})

describe('Overview scoping', () => {
  it('admin: requests events/players across every team', async () => {
    useMemberships.mockReturnValue({ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS })

    renderOverview()

    await waitFor(() => expect(listEvents).toHaveBeenCalled())
    const call = listEvents.mock.calls[0][0]
    expect(call.teamIds).toEqual(expect.arrayContaining(['t1', 't2']))
    expect(call.teamIds).toHaveLength(2)
  })

  it('coach: requests events/players scoped to only their own team', async () => {
    useMemberships.mockReturnValue({ memberships: COACH_MEMBERSHIPS, teams: TEAMS })

    renderOverview()

    await waitFor(() => expect(listEvents).toHaveBeenCalled())
    const call = listEvents.mock.calls[0][0]
    expect(call.teamIds).toEqual(['t1'])
  })
})

describe('Overview sections', () => {
  it('renders the upcoming-fixtures section with a fixture row', async () => {
    useMemberships.mockReturnValue({ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS })
    listEvents.mockResolvedValue([
      {
        id: 'e1',
        team_id: 't1',
        type: 'match',
        opponent: 'Dubai Exiles',
        venue: 'Zayed Sports City',
        home: true,
        starts_at: '2099-01-10T15:00:00Z',
      },
    ])

    renderOverview()

    expect(await screen.findByTestId('fixture-row')).toBeInTheDocument()
  })

  it('renders an RSVP status summary for a fixture with responses', async () => {
    useMemberships.mockReturnValue({ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS })
    listEvents.mockResolvedValue([
      { id: 'e1', team_id: 't1', type: 'match', starts_at: '2099-01-10T15:00:00Z' },
    ])
    listAvailabilityForEvents.mockResolvedValue([
      { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'in' },
      { id: 'a2', event_id: 'e1', player_id: 'p2', status: 'in' },
      { id: 'a3', event_id: 'e1', player_id: 'p3', status: 'maybe' },
    ])

    renderOverview()

    expect(await screen.findByTestId('rsvp-summary-e1')).toHaveTextContent('2 In')
    expect(screen.getByTestId('rsvp-summary-e1')).toHaveTextContent('1 Maybe')
  })

  it('renders roster gaps: player count and missing-contact count per team', async () => {
    useMemberships.mockReturnValue({ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS })
    listPlayers.mockResolvedValue([
      { id: 'p1', team_id: 't1', full_name: 'Alex' },
      { id: 'p2', team_id: 't1', full_name: 'Sam' },
    ])
    listContactsForPlayers.mockResolvedValue([{ player_id: 'p1', phone: '123', email: null }])

    renderOverview()

    const row = await screen.findByTestId('roster-gap-t1')
    expect(row).toHaveTextContent('2') // player count
    expect(row).toHaveTextContent('1') // missing-contact count (p2 has no row)
  })

  it('shows an empty state when there are no upcoming fixtures', async () => {
    useMemberships.mockReturnValue({ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS })

    renderOverview()

    expect(await screen.findByText(/no upcoming fixtures/i)).toBeInTheDocument()
  })

  it('shows a retry-able error card when a fetch fails', async () => {
    useMemberships.mockReturnValue({ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS })
    listEvents.mockRejectedValue(new Error('network down'))

    renderOverview()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/overview.test.jsx`
Expected: FAIL — `Cannot find module '../src/screens/Overview.jsx'`.

- [ ] **Step 3: Implement the screen**

Create `src/screens/Overview.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAvailabilityForEvents } from '../data/availability.js'
import { listEvents } from '../data/events.js'
import { listContactsForPlayers, listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { clubToday, eventDate, sortByStart } from '../lib/eventFormat.js'
import { isAdmin, visibleTeams } from '../lib/scope.js'

// Desktop-only organizer screen (design spec:
// docs/superpowers/specs/2026-08-03-club-overview-dashboard-design.md).
// Reached only via the desktop-only, role-gated Nav item (Task 4) — this
// component itself does not re-check width or role; by the time it renders,
// Nav/App.jsx have already decided who gets here. Scoping is still enforced
// the normal way (visibleTeams + RLS), so a stale/bad nav-visibility check
// could only ever fail to show a link, never widen what data comes back.
//
// Three sections, per the spec: upcoming fixtures across every visible team,
// RSVP status per fixture, and roster gaps per team. No activity feed here —
// that's Phase 2, gated on a not-yet-built audit-log table.

const UPCOMING_WINDOW_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

function statusCounts(rows) {
  const counts = { in: 0, maybe: 0, out: 0 }
  rows.forEach((row) => {
    if (counts[row.status] !== undefined) counts[row.status] += 1
  })
  return counts
}

export default function Overview() {
  const { memberships, teams } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  const [events, setEvents] = useState([])
  const [availability, setAvailability] = useState([])
  const [players, setPlayers] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedEventId, setSelectedEventId] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    const today = clubToday()
    const from = today.toISOString()
    const to = new Date(today.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS).toISOString()

    listEvents({ teamIds, from, to })
      .then((eventRows) => {
        if (!mounted) return
        setEvents(eventRows)
        const eventIds = eventRows.map((event) => event.id)
        return Promise.all([
          listAvailabilityForEvents(eventIds),
          listPlayers({ teamIds }),
        ])
      })
      .then((results) => {
        if (!mounted || !results) return
        const [availabilityRows, playerRows] = results
        setAvailability(availabilityRows)
        setPlayers(playerRows)
        const playerIds = playerRows.map((player) => player.id)
        return listContactsForPlayers(playerIds)
      })
      .then((contactRows) => {
        if (!mounted || !contactRows) return
        setContacts(contactRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setEvents([])
        setAvailability([])
        setPlayers([])
        setContacts([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setSettled(true)
      })

    return () => {
      mounted = false
    }
  }, [teamIds, reloadToken])

  const isFirstLoad = loading && !settled

  const upcoming = sortByStart(
    events.filter((event) => eventDate(event) != null),
    'asc',
  )

  const availabilityByEvent = useMemo(() => {
    const map = new Map()
    availability.forEach((row) => {
      if (!map.has(row.event_id)) map.set(row.event_id, [])
      map.get(row.event_id).push(row)
    })
    return map
  }, [availability])

  const playersByTeam = useMemo(() => {
    const map = new Map()
    players.forEach((player) => {
      if (!map.has(player.team_id)) map.set(player.team_id, [])
      map.get(player.team_id).push(player)
    })
    return map
  }, [players])

  const contactedPlayerIds = useMemo(() => new Set(contacts.map((row) => row.player_id)), [contacts])

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  if (isFirstLoad) {
    return (
      <section>
        <h2 className="sr-only">Overview</h2>
        <Card className="flex justify-center py-10">
          <Spinner label="Loading the overview…" />
        </Card>
      </section>
    )
  }

  if (error) {
    return (
      <section>
        <h2 className="sr-only">Overview</h2>
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the overview</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mx-auto mt-4 w-auto rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </Card>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-[22px] uppercase tracking-[0.03em] text-ink">Overview</h2>

      <h3 className="mb-2 mt-4 font-display text-[15px] uppercase tracking-[0.03em] text-ink">
        Upcoming fixtures
      </h3>
      {upcoming.length === 0 ? (
        <Card>
          <Empty message="No upcoming fixtures in the next two weeks." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {upcoming.map((event) => {
            const counts = statusCounts(availabilityByEvent.get(event.id) ?? [])
            const responded = counts.in + counts.maybe + counts.out
            const total = (playersByTeam.get(event.team_id) ?? []).length
            const noResponse = Math.max(0, total - responded)
            return (
              <div key={event.id}>
                <FixtureRow
                  event={event}
                  teamName={teamsById.get(event.team_id)?.name}
                  onSelect={setSelectedEventId}
                />
                <div
                  data-testid={`rsvp-summary-${event.id}`}
                  className="border-b border-line px-[14px] pb-3 text-[12.5px] text-ink-faint last:border-b-0"
                >
                  {counts.in} In · {counts.maybe} Maybe · {counts.out} Out
                  {noResponse > 0 ? ` · ${noResponse} no response` : ''}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <h3 className="mb-2 mt-5 font-display text-[15px] uppercase tracking-[0.03em] text-ink">
        Roster gaps
      </h3>
      <Card className="overflow-hidden">
        {scopedTeams.map((team) => {
          const teamPlayers = playersByTeam.get(team.id) ?? []
          const missingContact = teamPlayers.filter((player) => !contactedPlayerIds.has(player.id)).length
          return (
            <div
              key={team.id}
              data-testid={`roster-gap-${team.id}`}
              className="flex items-center justify-between border-b border-line px-[14px] py-2.5 text-sm last:border-b-0"
            >
              <span className="font-semibold text-ink">{team.name}</span>
              <span className="text-ink-faint">
                {teamPlayers.length} players
                {missingContact > 0 ? ` · ${missingContact} missing contact info` : ''}
              </span>
            </div>
          )
        })}
      </Card>
    </section>
  )
}
```

Note: this screen deliberately does not render `EventDetail`/`EventForm` sheets on fixture click yet — `selectedEventId` state is tracked but no sheet is wired in this task, since the spec calls for reusing the existing `EventDetail` sheet exactly as Dashboard does. Add that wiring as part of this same task before considering it done (copy the `{selectedEvent && !formState && <EventDetail .../>}` block from `src/screens/Dashboard.jsx`, including its `canEditTeam`/`onEdit`/`onDeleted` wiring, verbatim in shape) — omitted from the code block above only to keep this plan step focused on the three data sections; the implementer must include it before Step 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/overview.test.jsx`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Overview.jsx tests/overview.test.jsx
git commit -m "feat: add Overview screen (upcoming fixtures, RSVP status, roster gaps)"
```

---

### Task 4: Nav item, AppShell wiring, and route

**Files:**
- Modify: `src/components/Nav.jsx`
- Modify: `tests/nav.test.jsx`
- Modify: `src/components/AppShell.jsx`
- Modify: `tests/app-shell.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `Overview` from `src/screens/Overview.jsx` (Task 3), `isAdmin`/`visibleTeams`/`canEditTeam` from `src/lib/scope.js` (existing).
- Produces: a working `/overview` route, reachable via nav only for admin/coach at desktop width.

- [ ] **Step 1: Write the failing tests**

Add to `tests/nav.test.jsx`, without breaking the existing "exactly four items" assertions — those stay describing `NAV_ITEMS` (the shared, always-rendered list); the Overview link is a separate, conditionally-rendered addition, not a fifth entry in `NAV_ITEMS` itself:

```javascript
describe('Nav — Overview link (Task 4)', () => {
  it('does not render an Overview link when canManage is false (default)', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
  })

  it('renders an Overview link, hidden on mobile, when canManage is true', () => {
    render(
      <MemoryRouter initialEntries={['/']} future={routerFuture}>
        <Nav canManage />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Overview' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/overview')
    expect(link.className).toMatch(/\bhidden\b/)
    expect(link.className).toMatch(/desktop:flex/)
  })
})
```

(This requires updating the `renderNav` helper already in the file, or adding a second small render call as shown, to pass a `canManage` prop through to `<Nav />` — use whichever the existing file's structure makes cleaner; the helper currently takes only `initialEntry`.)

Add to `tests/app-shell.test.jsx` (read the existing mock setup for `useMemberships` in this file first, and match it exactly):

```javascript
describe('AppShell — Overview nav gating (Task 4)', () => {
  it('passes canManage=true to Nav for an admin', () => {
    useMemberships.mockReturnValue({
      memberships: [{ id: 'm0', role: 'admin', team_id: null, player_id: null }],
      teams: [],
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(/* existing AppShell test render wrapper, with children */)
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
  })

  it('does not pass canManage=true for a parent', () => {
    useMemberships.mockReturnValue({
      memberships: [{ id: 'm1', role: 'parent', team_id: 't1', player_id: 'p1' }],
      teams: [{ id: 't1', name: 'U12 Boys', sort_order: 4 }],
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(/* existing AppShell test render wrapper, with children */)
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
  })
})
```

The `render(...)` calls above intentionally reuse whatever render helper `tests/app-shell.test.jsx` already defines for wrapping `<AppShell>` with a router and children (the file has one — read it before writing these two tests and call it exactly the same way the file's other tests do, rather than introducing a second setup).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/nav.test.jsx tests/app-shell.test.jsx`
Expected: FAIL — no "Overview" link exists yet, `Nav` doesn't accept a `canManage` prop yet.

- [ ] **Step 3: Implement**

In `src/components/Nav.jsx`, keep `NAV_ITEMS` exactly as-is (unchanged — the mobile tab bar's 4-column grid and the existing "exactly Home/Schedule/Roster/More" test stay true). Change the component to accept and use a new prop:

```javascript
export default function Nav({ canManage = false }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 bg-chrome pb-[env(safe-area-inset-bottom)] shadow-tabbar desktop:static desktop:z-auto desktop:flex desktop:w-auto desktop:grid-cols-none desktop:gap-1 desktop:bg-transparent desktop:p-0 desktop:shadow-none"
    >
      <div className="brand-rule absolute inset-x-0 top-0 desktop:hidden" />
      {NAV_ITEMS.map(({ to, label, end, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={linkClassName}>
          <Icon className={'h-[23px] w-[23px] desktop:hidden'} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
      {canManage && (
        <NavLink
          to="/overview"
          // Desktop-only regardless of canManage: `hidden` keeps it out of
          // the mobile tab bar's grid-cols-4 layout entirely (display:none
          // removes it from grid flow, so the bar still shows exactly 4
          // visible cells on phone), `desktop:flex` brings it back as a
          // fifth pill in the desktop row, matching every other item's
          // `desktop:flex-row` shape from linkClassName.
          className={(state) => `${linkClassName(state)} hidden desktop:flex`}
        >
          <span>Overview</span>
        </NavLink>
      )}
    </nav>
  )
}
```

In `src/components/AppShell.jsx`, import `isAdmin`, `visibleTeams`, `canEditTeam` from `../lib/scope.js` (add whichever of these three aren't already imported — the file already imports `roleLabel` from the same module at line 5), compute the same "can manage anything" boolean `Dashboard.jsx` already computes, and pass it to `<Nav />`:

```javascript
// Near the existing `const { memberships, loading, error, reload } = useMemberships()` (line 111):
const scopedTeams = visibleTeams(memberships, teams)
const canManage = isAdmin(memberships) || scopedTeams.some((team) => canEditTeam(memberships, team.id))
```

(`teams` must also be destructured from `useMemberships()` alongside `memberships` if it isn't already — check the existing destructuring at line 111 and add it if missing.)

Then change the existing `<Nav />` call (line 218) to `<Nav canManage={canManage} />`.

In `src/App.jsx`, add the import and route:

```javascript
import Overview from './screens/Overview.jsx'
// ...
<Route path="/overview" element={<AppShell><Overview /></AppShell>} />
```

placed alongside the other four `<AppShell>`-wrapped routes (after `/roster`, before `/more`, matching nav order).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/nav.test.jsx tests/app-shell.test.jsx`
Expected: PASS, all tests including the new ones.

Then run the full suite to confirm nothing else broke:

Run: `npx vitest run`
Expected: PASS, every existing test file green, only new tests added.

- [ ] **Step 5: Commit**

```bash
git add src/components/Nav.jsx tests/nav.test.jsx src/components/AppShell.jsx tests/app-shell.test.jsx src/App.jsx
git commit -m "feat: wire Overview into nav (desktop-only, admin/coach only) and routing"
```

---

### Task 5: Browser verification

**Files:**
- Modify: `harness/main.jsx`
- Modify: `harness/stubs/availability.js`
- Create: `harness/shoot-overview.mjs`

**Interfaces:**
- Consumes: the real `Overview` screen (Task 3), the real `AppShell`/`Nav` (Task 4), harness stub modules (existing pattern).
- Produces: screenshots + measured DOM assertions under `screenshots/overview/` (gitignored, per `.gitignore`'s existing `screenshots` entry — not committed).

- [ ] **Step 1: Add an `overview`/`overview-admin` scenario to the harness**

In `harness/stubs/availability.js`, add a stub matching the real function's shape (the harness stubs must mirror the real `src/data/*` module's exports exactly, since Vite aliases the stub in for the real module — check `harness/vite.config.js`'s alias block to confirm `availability.js` is aliased there, which it already is for the existing `listAvailability`):

```javascript
export async function listAvailabilityForEvents(eventIds) {
  const results = []
  for (const eventId of eventIds) {
    results.push(...(await listAvailability(eventId)))
  }
  return results
}
```

In `harness/main.jsx`, import `Overview` from `'../src/screens/Overview.jsx'`, and add scenario branches following the exact pattern the file already uses for `dashboard`/`dashboard-admin`/`dashboard-parent` (find that `if (scenario === ...)` chain and add `overview-admin` using `ADMIN_MEMBERSHIPS`/`TEAMS` already defined in the file, and `overview-coach` using `COACH_MEMBERSHIPS`/`TEAMS`, each rendering `<Overview />` instead of `<Dashboard />` via the same `Shell({...})` helper the existing scenarios use).

- [ ] **Step 2: Write the verification script**

Create `harness/shoot-overview.mjs`, copying `harness/shoot-dashboard.mjs`'s structure (imports, `outDir`, `BASE`, the `chromium.launch()` loop) exactly, with:

```javascript
const shots = [
  { file: 'admin', scenario: 'overview-admin' },
  { file: 'coach', scenario: 'overview-coach' },
]

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
]
```

(no `mobile` viewport — this screen is desktop-only by design, so there is nothing to screenshot at phone width; the nav item itself not appearing at mobile width is already covered by Task 4's jsdom tests).

Inside the per-shot loop, after `page.goto(...)` and the existing `waitForTimeout`, add assertions specific to this screen (following the existing file's `page.evaluate(...)` pattern for reading real computed values rather than trusting source):

```javascript
const overviewChecks = await page.evaluate(() => ({
  hasOverviewNavLink: !!document.querySelector('a[href="/overview"]'),
  fixtureRowCount: document.querySelectorAll('[data-testid="fixture-row"]').length,
  rosterGapRowCount: document.querySelectorAll('[data-testid^="roster-gap-"]').length,
}))
```

and record `overviewChecks` in the same `results.push({...})` shape the existing script already uses, so the printed summary at the end of the script shows these alongside the existing overflow/console-error checks.

- [ ] **Step 3: Run the verification script**

Run: `npx vite --config harness/vite.config.js &` (start the harness dev server in the background), then `node harness/shoot-overview.mjs`
Expected: script completes with no console errors, `hasOverviewNavLink: true` for both scenarios, `fixtureRowCount`/`rosterGapRowCount` both non-zero (the `overview-admin`/`overview-coach` scenarios should use fixture data — reuse `EVENTS`/`PLAYERS` already defined in `harness/main.jsx`/`harness/stubs/` rather than inventing new fixture data, matching how every other scenario in the file does this).

Stop the background dev server afterward.

- [ ] **Step 4: Decide whether to commit the harness changes**

Per the established project convention (some harness additions were committed — e.g. Task 17/18's — others were throwaway and deleted before commit — e.g. Task 20's), commit the harness changes here since they follow the existing committed pattern (`shoot-dashboard.mjs` etc. are already in the repo) rather than being a one-off.

```bash
git add harness/main.jsx harness/stubs/availability.js harness/shoot-overview.mjs
git commit -m "test: add Overview screen browser-verification harness scenario"
```

---

## Self-Review Notes (completed during plan writing)

- **Spec coverage:** all three Phase-1 sections (fixtures, RSVP status, roster gaps), the nav/role/width gating, the new data functions, and the explicit Phase-2 exclusion (activity feed) are each covered by a task above.
- **Placeholder scan:** no TBD/TODO; the one deliberately-flagged gap (EventDetail sheet wiring inside Task 3) is called out explicitly with the exact reference to copy from, not left vague.
- **Type consistency:** `listAvailabilityForEvents(eventIds)` and `listContactsForPlayers(playerIds)` are used with the same names/argument shapes in Task 3 as they're defined in Tasks 1–2. `Overview` (default export) matches what Task 4 imports.
