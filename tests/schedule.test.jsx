import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/screens/Schedule.jsx + src/screens/EventDetail.jsx
// (Task 11). useMemberships and both data modules are mocked, so this
// exercises only the screen's own behaviour — scoping the query to the
// user's visible teams, splitting upcoming vs results, filtering by team
// pill, the calendar month view, the detail sheet's availability summary,
// realtime refresh, and the loading/empty/error contract. No network is
// ever reachable from this file.
//
// Deliberately NOT faked: the clock. RTL's waitFor does not detect
// Vitest's fake timers (its jestFakeTimersAreEnabled() check looks for a
// global `jest`), so vi.useFakeTimers() makes every findBy*/waitFor hang.
// Fixture timestamps are therefore computed relative to the real "now",
// and the calendar assertions compute their expected month label the same
// way the screen does rather than hard-coding a date.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const listAvailabilityMock = vi.fn()
const subscribeAvailabilityMock = vi.fn()
const setAvailabilityMock = vi.fn()
const listPlayersMock = vi.fn()

// The `availability` feature flag (src/lib/features.js) defaults to false in
// the real app as of 2026-07-29 — the club isn't using RSVP yet. Every
// existing test below that exercises the availability summary/entry point
// was written when the feature was on, and still proves that built behaviour
// works; it does so by forcing the flag on via this mutable mock object,
// reset in beforeEach. The "flag off" describe block near the bottom of this
// file tests the real, current default instead.
// vi.mock's factory is hoisted above every top-level const in this file, so
// the mutable flag object it returns has to be created via vi.hoisted rather
// than a plain const — otherwise the factory closes over a
// not-yet-initialised binding and throws before a single test runs.
const featuresMock = vi.hoisted(() => ({ availability: true }))
vi.mock('../src/lib/features.js', () => ({ FEATURES: featuresMock }))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: (...args) => subscribeAvailabilityMock(...args),
  setAvailability: (...args) => setAvailabilityMock(...args),
}))

// Task 16: Availability (the RSVP/team-sheet sheet opened from EventDetail)
// also reads the team roster. This file's own suite for that screen's
// behaviour lives in tests/availability.test.jsx; the tests below only
// prove Schedule wires the entry point/sheet correctly.
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Schedule, { ALL_TYPES_ID, filterByType } from '../src/screens/Schedule.jsx'

const DAY = 24 * 60 * 60 * 1000

const days = (n) => new Date(Date.now() + n * DAY).toISOString()

// The displayed month follows the CLUB's today (Abu Dhabi), not the runner's.
// Those differ for the last four hours of every UTC day, so deriving the
// expectation from `new Date()` would flake nightly. Computed independently of
// src/lib/eventFormat.js, so the assertions are not just the implementation
// agreeing with itself.
//
// At module scope rather than inside one describe: both the calendar-tab suite
// and the day-sheet suite need it, and a second copy is a thing that drifts.
const dubaiToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find((part) => part.type === type).value)
  return { year: get('year'), month: get('month') - 1, day: get('day') }
}

// Month names are read off a UTC-anchored instant so they never depend on the
// process zone either.
const monthName = (year, month) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'long' }).format(Date.UTC(year, month, 1))

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH_ONE_TEAM = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

// e-upcoming-match / e-upcoming-training are future-dated with no score.
// e-played-no-score is PAST-dated with no score — per the locked-in
// decision it is still "Upcoming", because a result is a score, not an
// elapsed date. e-result has a score and is the only Results row.
const UPCOMING_MATCH = {
  id: 'e-upcoming-match',
  team_id: 'team-u10',
  type: 'match',
  title: null,
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City',
  competition: 'West Asia Premiership',
  starts_at: days(3),
  result_us: null,
  result_them: null,
}
const UPCOMING_TRAINING = {
  id: 'e-upcoming-training',
  team_id: 'team-1xv',
  type: 'training',
  title: 'Senior squad training',
  opponent: null,
  home: true,
  venue: 'Zayed Sports City',
  competition: null,
  starts_at: days(5),
  result_us: null,
  result_them: null,
}
const PLAYED_NO_SCORE = {
  id: 'e-played-no-score',
  team_id: 'team-1xv',
  type: 'match',
  title: null,
  opponent: 'Bahrain Warriors',
  home: false,
  venue: 'Bahrain RFC',
  competition: null,
  starts_at: days(-4),
  result_us: null,
  result_them: null,
}
const RESULT_WIN = {
  id: 'e-result',
  team_id: 'team-u10',
  type: 'match',
  title: null,
  opponent: 'Al Ain Amblers',
  home: true,
  venue: 'Zayed Sports City',
  competition: null,
  starts_at: days(-11),
  result_us: 31,
  result_them: 19,
}

const ALL_EVENTS = [RESULT_WIN, PLAYED_NO_SCORE, UPCOMING_MATCH, UPCOMING_TRAINING]

// jsdom applies no CSS at all — no Tailwind, and no UA stylesheet layout
// either — so asserting on the literal class token is the only way to make a
// statement about how something will actually be laid out. Same helper, same
// reasoning as tests/app-shell.test.jsx and tests/components.test.jsx.
function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

const unsubscribeEvents = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // ⚠️ jsdom's localStorage is ONE store for the whole file. Both schedule
  // filters persist to it, so without this a test that clicks "Training" or a
  // team pill leaves that filter set for every test that runs after it — and
  // the failure would land in an unrelated test, which is the expensive kind
  // to chase.
  window.localStorage.clear()
  featuresMock.availability = true
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  listEventsMock.mockResolvedValue(ALL_EVENTS)
  subscribeEventsMock.mockReturnValue(unsubscribeEvents)
  listAvailabilityMock.mockResolvedValue([])
  subscribeAvailabilityMock.mockReturnValue(vi.fn())
  setAvailabilityMock.mockResolvedValue({ id: 'a-1' })
  listPlayersMock.mockResolvedValue([])
})

function setup() {
  const user = userEvent.setup()
  const utils = render(withRouter(<Schedule />))
  return { user, ...utils }
}

// ⚠️ Schedule and the Dashboard became ROUTER-AWARE on 12 Aug 2026: the match
// sheet is a full-page form, so EventDetail's entry point navigates rather
// than opening a sheet. Rendering them bare now throws "useNavigate() may be
// used only in the context of a <Router>". Wrapping here is the honest fix —
// the real app never renders these outside a Router, and a test that did was
// exercising a shape production does not have.
function withRouter(ui) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  )
}

describe('Schedule — loading, empty and error states', () => {
  it('shows a loading state while the events query is in flight', () => {
    listEventsMock.mockReturnValue(new Promise(() => {}))

    setup()

    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
  })

  it('shows an empty state when there are no upcoming fixtures', async () => {
    listEventsMock.mockResolvedValue([])

    setup()

    expect(await screen.findByText(/no upcoming fixtures/i)).toBeInTheDocument()
  })

  it('renders a failed events query in an alert region, with a retry', async () => {
    listEventsMock.mockRejectedValue(new Error('Network unreachable'))

    const { user } = setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/network unreachable/i)).toBeInTheDocument()

    listEventsMock.mockResolvedValue(ALL_EVENTS)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Schedule — scoping the query', () => {
  // ⚠️ STILL AN EXACT MATCH, NOT objectContaining. These assertions caught
  // "the query asks for more than it should", which is the whole point of a
  // scoping test — loosening them to allow the date window would also have
  // allowed a stray filter nobody noticed. The window is named explicitly
  // instead, so it cannot be dropped either.
  it('queries only the teams the signed-in user can see, within a date window', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(listEventsMock).toHaveBeenCalledWith({
      teamIds: ['team-u10'],
      from: expect.any(String),
      to: expect.any(String),
    })
  })

  it('passes every visible team, in display order, for an admin', async () => {
    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(listEventsMock).toHaveBeenCalledWith({
      teamIds: ['team-u10', 'team-1xv'],
      from: expect.any(String),
      to: expect.any(String),
    })
  })

  it('⚠️ never asks for every event ever — the window is always passed', async () => {
    // The regression this guards: `listEvents` accepted `from`/`to` from the
    // day it was written and NO caller passed one for weeks, so every screen
    // asked for every event in scope and relied on the row cap to notice.
    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    const [args] = listEventsMock.mock.calls.at(-1)
    expect(args.from, 'listEvents called with no `from` — unbounded read').toBeTruthy()
    expect(args.to, 'listEvents called with no `to` — unbounded read').toBeTruthy()
    expect(Date.parse(args.from)).toBeLessThan(Date.parse(args.to))
  })
})

describe('Schedule — Upcoming vs Results', () => {
  it('lists fixtures without a score under Upcoming', async () => {
    setup()

    expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()
    expect(screen.queryByText('Quins vs Al Ain Amblers')).not.toBeInTheDocument()
  })

  it('keeps a past-dated fixture with no score in Upcoming, not Results', async () => {
    const { user } = setup()

    expect(await screen.findByText('Quins vs Bahrain Warriors')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Results' }))

    expect(screen.queryByText('Quins vs Bahrain Warriors')).not.toBeInTheDocument()
    expect(screen.getByText('Quins vs Al Ain Amblers')).toBeInTheDocument()
  })

  it('shows only scored fixtures under Results, with the outcome and score', async () => {
    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Results' }))

    expect(screen.getByText('Quins vs Al Ain Amblers')).toBeInTheDocument()
    expect(screen.getByText('Won')).toBeInTheDocument()
    expect(screen.getByText('31–19')).toBeInTheDocument()
    expect(screen.queryByText('Quins vs Dubai Exiles')).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing has a score yet', async () => {
    listEventsMock.mockResolvedValue([UPCOMING_MATCH])

    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Results' }))

    expect(screen.getByText(/no results yet/i)).toBeInTheDocument()
  })
})

describe('Schedule — team filter', () => {
  it('filters the list to the selected team', async () => {
    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /age group/i }), 'team-u10')

    expect(screen.getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.queryByText('Senior squad training')).not.toBeInTheDocument()
  })

  it('hides the team filter when the user can only see one team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.queryByRole('combobox', { name: /age group/i })).not.toBeInTheDocument()
  })

  // Memberships can reload and shrink a user's scope while a pill is
  // selected; the stored filter then names a team that is gone. The worst
  // sub-case is a shrink to ONE team, because the pill row hides itself below
  // two teams — so there is no "All" pill left to click, and without the
  // reconciliation in Schedule.jsx the list would stay empty until the user
  // navigated away. Roster.jsx carries the identical guard and test.
  it('falls back to all teams when the selected team leaves the scope', async () => {
    const { user, rerender } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.selectOptions(screen.getByRole('combobox', { name: /age group/i }), 'team-u10')
    expect(screen.queryByText('Senior squad training')).not.toBeInTheDocument()

    useMembershipsMock.mockReturnValue(memberships([{ id: 'm5', role: 'coach', team_id: 'team-1xv' }]))
    listEventsMock.mockResolvedValue([UPCOMING_TRAINING])
    rerender(withRouter(<Schedule />))

    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()
    expect(screen.queryByText(/no upcoming fixtures/i)).not.toBeInTheDocument()
  })
})

describe('Schedule — no scope banner', () => {
  it('shows no scope or read-only banner to a coach', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
      // The scope banner was removed on 4 Aug 2026 (Jay's call): being scoped
      // to your own squads is expected behaviour for every role, not an
      // exception worth a banner on every screen. Asserted as an ABSENCE so
      // it cannot quietly come back.
    expect(screen.queryByText(/you're seeing/i)).toBeNull()
    expect(screen.queryByText(/read-only/i)).toBeNull()
  })

  it('shows no scope or read-only banner to a parent either', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.queryByText(/read-only/i)).toBeNull()
    expect(screen.queryByText(/every other age group is hidden/i)).toBeNull()
  })

  it('shows no scope note to an admin', async () => {
    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.queryByText(/you're seeing/i)).not.toBeInTheDocument()
    expect(screen.getByText('All squads')).toBeInTheDocument()
  })
})

describe('Schedule — calendar tab', () => {
  // The displayed month follows the CLUB's today (Abu Dhabi), not the
  // runner's. Those differ for the last four hours of every UTC day, so
  // deriving the expectation from `new Date()` would flake nightly. This
  // computes the reference independently of src/lib/eventFormat.js, so the
  // assertions are not just the implementation agreeing with itself.
  // dubaiToday() and monthName() now live at module scope (search upward for
  // them) so the day-sheet suite can use the same reference implementation
  // rather than keeping a second copy in step by hand.

  const monthLabel = (offset = 0) => {
    const { year, month } = dubaiToday()
    const anchor = new Date(Date.UTC(year, month + offset, 1))
    return anchor.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' })
  }

  const inTimeZone = async (zone, fn) => {
    const previous = process.env.TZ
    process.env.TZ = zone
    try {
      await fn()
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  }

  // 21:00 UTC is 01:00 the NEXT day in Dubai. A grid that buckets by the
  // browser's local day puts this fixture in the wrong cell — visibly wrong
  // to a coach, and the kind of defect that only shows up outside UTC+4.
  it('buckets a fixture into its Abu Dhabi day, not the browser\'s', async () => {
    await inTimeZone('America/New_York', async () => {
      const { year, month } = dubaiToday()
      // Mid-month, so the roll-forward can never leave the displayed month
      // and turn this into a month-boundary test by accident.
      const startsAt = new Date(Date.UTC(year, month, 15, 21, 0)).toISOString()
      listEventsMock.mockResolvedValue([{ ...UPCOMING_MATCH, starts_at: startsAt }])

      const { user } = setup()

      await screen.findByText('Quins vs Dubai Exiles')
      await user.click(screen.getByRole('button', { name: 'Calendar' }))

      const name = monthName(year, month)
      expect(screen.getByRole('button', { name: `16 ${name}, 1 event` })).toBeInTheDocument()
      // Every cell is a button as of Task 23, so "the 15th is not a button"
      // no longer distinguishes an empty day from a populated one. Repointed
      // at the count in the label instead, which still fails loudly if the
      // grid buckets by the browser's day and drags this fixture back a cell.
      expect(screen.getByRole('button', { name: `15 ${name}, no events` })).toBeInTheDocument()
    })
  })

  it('carries a fixture into the next month when Abu Dhabi has already rolled over', async () => {
    await inTimeZone('America/New_York', async () => {
      const { year, month } = dubaiToday()
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      // 21:00 UTC on the last day of the month = 01:00 on the 1st next month
      // in Dubai.
      const startsAt = new Date(Date.UTC(year, month, lastDay, 21, 0)).toISOString()
      listEventsMock.mockResolvedValue([{ ...UPCOMING_MATCH, starts_at: startsAt }])

      const { user } = setup()

      await screen.findByText('Quins vs Dubai Exiles')
      await user.click(screen.getByRole('button', { name: 'Calendar' }))

      // Nothing at all in this month's grid: every populated cell is a button
      // whose name ends in "N event(s)".
      expect(screen.queryAllByRole('button', { name: /, \d+ events?$/ })).toHaveLength(0)
      expect(screen.getByText(/nothing is scheduled this month/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /next month/i }))

      const nextName = monthName(year, month + 1)
      expect(screen.getByRole('button', { name: `1 ${nextName}, 1 event` })).toBeInTheDocument()
    })
  })

  // The today-ring has to follow Abu Dhabi's day too — for four hours of
  // every UTC day the club is already on tomorrow, and a coach in London or
  // New York is further behind still. Pinning the clock is the only way to
  // test this: at a live "now" the club day and the runner's day agree for
  // 20 hours out of 24, so an unpinned assertion would pass against a
  // browser-local implementation almost all the time.
  //
  // Only `Date` is faked (`toFake: ['Date']`). Faking setTimeout/setInterval
  // is the trap documented at the top of this file — RTL's waitFor does not
  // detect Vitest's fake timers, so every findBy*/waitFor would hang. Real
  // timers plus a frozen Date gives a controlled clock and a working
  // await-loop at the same time.
  it('rings the Abu Dhabi today, not the browser’s', async () => {
    // 2026-07-20T21:00Z is 01:00 on the 21st in Dubai, but still the 20th
    // in New York (17:00) and in UTC — so the correct ring (21) and the
    // browser-local one (20) are different cells under either process zone.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 6, 20, 21, 0) })
    try {
      await inTimeZone('America/New_York', async () => {
        listEventsMock.mockResolvedValue([])

        const { user } = setup()

        await screen.findByText(/no upcoming fixtures/i)
        await user.click(screen.getByRole('button', { name: 'Calendar' }))

        // Guard the guard: the fake clock must actually be in force, and
        // the browser-local day must actually differ from the club's.
        expect(new Date().toISOString()).toBe('2026-07-20T21:00:00.000Z')
        expect(new Date().getDate()).toBe(20)

        expect(screen.getByText('July 2026')).toBeInTheDocument()

        // Day cells only (leading blanks carry no testid), so index N is
        // day N + 1.
        const cells = screen.getAllByTestId('calendar-day')
        expect(cells).toHaveLength(31)

        const ringed = cells.filter((cell) => hasClassToken(cell, 'border-brand'))
        expect(ringed).toHaveLength(1)
        expect(ringed[0]).toBe(cells[20]) // the 21st
        expect(ringed[0]).toHaveTextContent('21')
        // And the browser-local day is explicitly NOT ringed.
        expect(hasClassToken(cells[19], 'border-brand')).toBe(false)
        expect(hasClassToken(cells[19], 'border-line')).toBe(true)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  // A day with events has to be a <button> for keyboard access; a day
  // without one stays a <div>. Chromium's UA stylesheet lays a button's
  // content out centred inside its box, so the two variants silently drifted
  // apart vertically — populated days floated mid-cell while their empty
  // neighbours sat top-left (measured 66px vs 8px from the cell top at
  // 1280px). jsdom applies no UA stylesheet and computes no layout, so no
  // rendering assertion here could ever catch that. The testable invariant
  // is that both variants carry the same alignment classes, which is what
  // pins the number to the same place in either.
  it('aligns populated and empty day cells identically', async () => {
    const today = new Date()
    listEventsMock.mockResolvedValue([
      {
        ...UPCOMING_MATCH,
        starts_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString(),
      },
    ])

    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Calendar' }))

    const cells = screen.getAllByTestId('calendar-day')

    // As of Task 23 every cell is a <button>, because every day is actionable
    // — a day with no events opens to "add one". This assertion is the point
    // of the test now: the original mismatch was a <button> and a <div> laying
    // their content out differently under Chromium's UA stylesheet, so proving
    // there is only ever ONE tag is what forecloses that whole class of bug.
    expect(cells.every((cell) => cell.tagName === 'BUTTON')).toBe(true)

    // Split on the label rather than the tag, so both visual states are still
    // covered: a populated cell also renders the dot row, which an empty one
    // does not, and that is the remaining way the two could drift.
    const empty = cells.filter((cell) => /, no events$/.test(cell.getAttribute('aria-label') ?? ''))
    const populated = cells.filter((cell) => !/, no events$/.test(cell.getAttribute('aria-label') ?? ''))

    // Guard the guard: if the month ever rendered only one state, the
    // comparison below would pass vacuously.
    expect(populated.length).toBeGreaterThan(0)
    expect(empty.length).toBeGreaterThan(0)

    // `flex` overrides the UA's centred button layout; `items-start` and
    // `justify-start` then place the number top-left in both states.
    const alignmentTokens = ['relative', 'flex', 'items-start', 'justify-start', 'text-left', 'p-[5px]']
    alignmentTokens.forEach((token) => {
      expect(populated.every((cell) => hasClassToken(cell, token))).toBe(true)
      expect(empty.every((cell) => hasClassToken(cell, token))).toBe(true)
    })
  })

  // The weekday-header assertions use an empty event list on purpose: a
  // fixture row's date box also renders a short weekday ("Sun"), and which
  // weekday that is depends on the day the suite runs, so a populated list
  // would make getByText('Sun') intermittently ambiguous.
  it('renders a month grid for the current month', async () => {
    listEventsMock.mockResolvedValue([])

    const { user } = setup()

    await screen.findByText(/no upcoming fixtures/i)
    await user.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.getByText(monthLabel(0))).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Sat')).toBeInTheDocument()
  })

  it('moves between months', async () => {
    listEventsMock.mockResolvedValue([])

    const { user } = setup()

    await screen.findByText(/no upcoming fixtures/i)
    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    await user.click(screen.getByRole('button', { name: /next month/i }))

    expect(screen.getByText(monthLabel(1))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /previous month/i }))

    expect(screen.getByText(monthLabel(0))).toBeInTheDocument()
  })

  it('lists this month’s fixtures under the grid, whatever tab they belong to', async () => {
    const today = new Date()
    const todayEvent = { ...UPCOMING_MATCH, starts_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString() }
    // Last month, so it must NOT appear in this month's list.
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15, 17, 0)
    const otherMonthEvent = { ...UPCOMING_TRAINING, starts_at: lastMonth.toISOString() }
    listEventsMock.mockResolvedValue([todayEvent, otherMonthEvent])

    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.queryByText('Senior squad training')).not.toBeInTheDocument()
  })

  it('hides the team filter on the calendar tab', async () => {
    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.getByRole('combobox', { name: /age group/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.queryByRole('combobox', { name: /age group/i })).not.toBeInTheDocument()
  })
})

// Task 23. Tapping a cell used to open dayEvents[0] and swallow the rest;
// empty cells did nothing at all. These prove the sheet that replaced that.
describe('Schedule — calendar day sheet (Task 23)', () => {
  // Mid-month so the fixtures can never roll into a neighbouring month and
  // turn one of these into an accidental month-boundary test.
  const dayAt = (hour = 13) => {
    const { year, month } = dubaiToday()
    return { year, month, iso: new Date(Date.UTC(year, month, 15, hour - 4)).toISOString() }
  }

  const openDay = async (user, dayNumber, name) => {
    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^${dayNumber} ${name},`) }))
  }

  it('lists EVERY event on a day, not just the first', async () => {
    const { year, month, iso } = dayAt(13)
    listEventsMock.mockResolvedValue([
      { ...UPCOMING_MATCH, id: 'e1', starts_at: iso, opponent: 'Dubai Exiles' },
      { ...UPCOMING_MATCH, id: 'e2', starts_at: iso, opponent: 'Al Ain Amblers' },
      { ...UPCOMING_MATCH, id: 'e3', starts_at: iso, opponent: 'Bahrain' },
    ])

    const { user } = setup()
    await screen.findAllByText(/Dubai Exiles/)
    await openDay(user, 15, monthName(year, month))

    // Scoped to the sheet on purpose. The month's fixture list under the grid
    // also names every event, so an unscoped query would pass even if the
    // sheet rendered nothing at all.
    const sheet = within(await screen.findByRole('dialog'))

    // The regression this feature fixes: two of these three were previously
    // unreachable from the calendar, despite their dots being drawn.
    expect(sheet.getByText(/Dubai Exiles/)).toBeInTheDocument()
    expect(sheet.getByText(/Al Ain Amblers/)).toBeInTheDocument()
    expect(sheet.getByText(/Bahrain/)).toBeInTheDocument()
  })

  it('opens on an EMPTY day too, and offers to add an event there', async () => {
    const { year, month } = dubaiToday()
    listEventsMock.mockResolvedValue([])

    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Calendar' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^15 ${monthName(year, month)}, no events`) }))

    // Scoped: the screen header carries its own Add event button, so an
    // unscoped query would pass whether or not the sheet offered one.
    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByText('Nothing on this day.')).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Add event' })).toBeInTheDocument()
  })

  it('does not offer Add event to someone who cannot manage fixtures', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    const { year, month } = dubaiToday()
    listEventsMock.mockResolvedValue([])

    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Calendar' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^15 ${monthName(year, month)}, no events`) }))

    // The sheet still opens — a parent may legitimately want to see what is
    // on. What they must not get is the way to write to it.
    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByText('Nothing on this day.')).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Add event' })).not.toBeInTheDocument()
  })

  it('prefills the event form with the day that was tapped', async () => {
    const { year, month } = dubaiToday()
    listEventsMock.mockResolvedValue([])

    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Calendar' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^15 ${monthName(year, month)}, no events`) }))
    const sheet = within(await screen.findByRole('dialog'))
    await user.click(sheet.getByRole('button', { name: 'Add event' }))

    // The whole point of opening the form from a cell: the date is already
    // known, so the user should never have to retype it. Asserted as the
    // CLUB's 15th — a form that defaulted to today, or that let the browser
    // zone shift the day, fails here.
    const pad = (n) => String(n).padStart(2, '0')
    const dateField = await screen.findByLabelText(/date/i)
    expect(dateField).toHaveValue(`${year}-${pad(month + 1)}-15`)
  })
})

describe('Schedule — event detail sheet', () => {
  it('opens the detail sheet for a fixture and shows its details', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Zayed Sports City')).toBeInTheDocument()
    expect(within(dialog).getByText('West Asia Premiership')).toBeInTheDocument()
    expect(within(dialog).getByText('U10')).toBeInTheDocument()
  })

  it('says once that times are Abu Dhabi time, on the date line only', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    const dialog = screen.getByRole('dialog')
    // On the detail sheet's date/time line...
    expect(within(dialog).getByText(/Abu Dhabi time/)).toBeInTheDocument()
    // ...and exactly once, not once per fixture row behind it.
    expect(screen.getAllByText(/Abu Dhabi time/)).toHaveLength(1)
  })

  it('summarises availability for an upcoming fixture', async () => {
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', player_id: 'p1', status: 'in' },
      { id: 'a2', player_id: 'p2', status: 'in' },
      { id: 'a3', player_id: 'p3', status: 'maybe' },
      { id: 'a4', player_id: 'p4', status: 'out' },
    ])

    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    expect(listAvailabilityMock).toHaveBeenCalledWith('e-upcoming-match')

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('2 in')).toBeInTheDocument()
    expect(within(dialog).getByText('1 maybe')).toBeInTheDocument()
    expect(within(dialog).getByText('1 out')).toBeInTheDocument()
  })

  it('says so when nobody has responded yet', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText(/no one has responded yet/i)).toBeInTheDocument()
  })

  it('shows the score instead of availability once a fixture has a result', async () => {
    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Results' }))
    await user.click(screen.getByRole('button', { name: /Al Ain Amblers/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('31–19')).toBeInTheDocument()
    expect(listAvailabilityMock).not.toHaveBeenCalled()
  })

  it('surfaces an availability query failure inside the sheet', async () => {
    listAvailabilityMock.mockRejectedValue(new Error('Availability unavailable'))

    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/availability unavailable/i)
  })

  it('closes the sheet when the fixture disappears from a realtime refresh', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    listEventsMock.mockResolvedValue([UPCOMING_TRAINING])
    const [onChange] = subscribeEventsMock.mock.calls[0]
    await act(async () => {
      onChange({ eventType: 'DELETE' })
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Schedule — availability entry point (Task 16)', () => {
  it('opens the Availability sheet for the selected fixture, and closing it returns to the detail sheet', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))
    const detail = screen.getByRole('dialog')
    await user.click(within(detail).getByRole('button', { name: /set availability/i }))

    // Passed the right event/team: Availability's own header renders the
    // fixture title and age group — proof this is wired to the SELECTED
    // fixture, not a stale or wrong one.
    const availabilitySheet = screen.getByRole('dialog')
    expect(within(availabilitySheet).getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u10'] })

    // One sheet at a time: the detail sheet's own content is gone.
    expect(within(availabilitySheet).queryByText('West Asia Premiership')).not.toBeInTheDocument()

    await user.click(within(availabilitySheet).getByRole('button', { name: /close/i }))

    // Back to the detail sheet, not all the way out to the schedule list.
    expect(await screen.findByText('West Asia Premiership')).toBeInTheDocument()
  })

  it('offers the entry point to a read-only parent too, worded differently from the coach/admin label', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))
    const detail = screen.getByRole('dialog')

    expect(within(detail).getByRole('button', { name: /set my availability/i })).toBeInTheDocument()
  })

  it('does not open the wrong fixture’s availability sheet when a different row is picked mid-flow', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))
    await user.click(screen.getByRole('button', { name: /set availability/i }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Quins vs Dubai Exiles' })).toBeInTheDocument()

    // Close entirely and pick the OTHER upcoming fixture.
    await user.click(screen.getByRole('button', { name: /close/i }))
    await user.click(await screen.findByRole('button', { name: /Senior squad training/ }))

    // Lands on ITS detail sheet, not stuck showing an availability sheet
    // left open from the previous selection.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Senior squad training')).toBeInTheDocument()
  })
})

describe('Schedule — realtime', () => {
  it('refetches when an events change arrives, and unsubscribes on unmount', async () => {
    const { unmount } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(listEventsMock).toHaveBeenCalledTimes(1)

    const [onChange] = subscribeEventsMock.mock.calls[0]
    listEventsMock.mockResolvedValue([UPCOMING_TRAINING])
    await act(async () => {
      onChange({ eventType: 'INSERT' })
    })

    expect(listEventsMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Quins vs Dubai Exiles')).not.toBeInTheDocument()

    unmount()
    expect(unsubscribeEvents).toHaveBeenCalledTimes(1)
  })

  // A realtime change fires for every insert/update/delete anywhere in
  // scope, from any user. If the refetch swapped the list for a spinner, the
  // rows would be torn out of the DOM and the page height would collapse
  // every time somebody else touched a fixture. The "refetches when a change
  // arrives" test above passes either way, because both promises have
  // settled by the time it asserts — so this one holds the refetch open and
  // looks at what is on screen mid-flight.
  it('keeps the current rows on screen while a realtime refresh is in flight', async () => {
    setup()

    await screen.findByText('Quins vs Dubai Exiles')

    let resolveRefresh
    listEventsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    const [onChange] = subscribeEventsMock.mock.calls[0]
    act(() => {
      onChange({ eventType: 'UPDATE' })
    })

    expect(screen.getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(async () => {
      resolveRefresh([UPCOMING_TRAINING])
    })

    expect(screen.queryByText('Quins vs Dubai Exiles')).not.toBeInTheDocument()
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()
  })

  it('keeps the availability bar on screen while an RSVP refresh is in flight', async () => {
    listAvailabilityMock.mockResolvedValue([
      { id: 'a1', player_id: 'p1', status: 'in' },
      { id: 'a2', player_id: 'p2', status: 'out' },
    ])

    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('1 in')).toBeInTheDocument()

    let resolveRefresh
    listAvailabilityMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    const [, onAvailabilityChange] = subscribeAvailabilityMock.mock.calls[0]
    act(() => {
      onAvailabilityChange({ eventType: 'INSERT' })
    })

    expect(within(dialog).getByText('1 in')).toBeInTheDocument()
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()

    await act(async () => {
      resolveRefresh([
        { id: 'a1', player_id: 'p1', status: 'in' },
        { id: 'a2', player_id: 'p2', status: 'out' },
        { id: 'a3', player_id: 'p3', status: 'in' },
      ])
    })

    expect(within(dialog).getByText('2 in')).toBeInTheDocument()
  })

  it('subscribes once, not once per re-render', async () => {
    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Results' }))
    await user.click(screen.getByRole('button', { name: 'Upcoming' }))

    expect(subscribeEventsMock).toHaveBeenCalledTimes(1)
  })
})

describe('Schedule — responsive rendering', () => {
  // jsdom applies no CSS, so getByText passing proves nothing about what a
  // phone actually shows — an earlier task shipped a role label that was
  // CSS-hidden at every width while the test passed. The schedule has no
  // breakpoint-dependent content by design, so the guard is simply: no
  // rendered node carries a bare `hidden` class token.
  // Every tab is walked, not just the first: the Results rows carry content
  // (the outcome chip and the score) that the Upcoming rows don't, so a
  // guard that only ever saw Upcoming would miss a `hidden` there entirely.
  it('hides no schedule content behind a breakpoint, on any tab', async () => {
    const { user, container } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(container.querySelectorAll('.hidden')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Results' }))
    expect(screen.getByText('31–19')).toBeInTheDocument()
    expect(container.querySelectorAll('.hidden')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(container.querySelectorAll('.hidden')).toHaveLength(0)
  })
})

describe('Schedule — availability flag off (real default as of 2026-07-29)', () => {
  beforeEach(() => {
    featuresMock.availability = false
  })

  it('shows neither the availability summary nor a set-availability button on an upcoming fixture', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/availability/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /availability/i })).not.toBeInTheDocument()
    // The flag being off must mean the query is never even made, not just
    // that its result is hidden — otherwise turning it back on would need a
    // second look to confirm no stray network call was left running.
    expect(listAvailabilityMock).not.toHaveBeenCalled()
  })

  it('still shows the result for a played fixture — the flag only affects unplayed ones', async () => {
    const { user } = setup()

    await screen.findByText('Quins vs Dubai Exiles')
    await user.click(screen.getByRole('button', { name: 'Results' }))
    await user.click(screen.getByRole('button', { name: /Al Ain Amblers/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('31–19')).toBeInTheDocument()
  })
})

// ══ THE EVENT-TYPE FILTER (9 Aug 2026) ══════════════════════════════════
// "In upcoming we should have a option to view matches, training, or socials"
// — and, asked directly, EVERYONE sees it, not just admin/coach. A parent
// asking "when is the next training?" is the main case for it.
//
// Two halves, tested separately on purpose:
//   1. filterByType — the whole of the logic, tested as a pure function.
//   2. the screen — that the pills are wired to it, that the row appears only
//      on Upcoming, and that the filter survives a reload.
describe('filterByType — the filter itself', () => {
  it('returns everything for the All pill', () => {
    expect(filterByType(ALL_EVENTS, ALL_TYPES_ID)).toBe(ALL_EVENTS)
  })

  it('keeps only the matching type', () => {
    const trainings = filterByType(ALL_EVENTS, 'training')
    expect(trainings).toEqual([UPCOMING_TRAINING])
  })

  it('narrows to matches without dropping any of them', () => {
    // Three of the four fixtures are matches. A filter that returned two would
    // still look right on screen.
    expect(filterByType(ALL_EVENTS, 'match').map((event) => event.id)).toEqual([
      RESULT_WIN.id,
      PLAYED_NO_SCORE.id,
      UPCOMING_MATCH.id,
    ])
  })

  // ⚠️ A FILTER ID WE DON'T RECOGNISE SHOWS EVERYTHING, NOT NOTHING. A stale
  // value in localStorage from an older build, or a type we later rename,
  // must not present as "the club has nothing on".
  it('shows everything rather than nothing for an unknown filter', () => {
    expect(filterByType(ALL_EVENTS, 'tour')).toBe(ALL_EVENTS)
    expect(filterByType(ALL_EVENTS, '')).toBe(ALL_EVENTS)
    expect(filterByType(ALL_EVENTS, null)).toBe(ALL_EVENTS)
    expect(filterByType(ALL_EVENTS, undefined)).toBe(ALL_EVENTS)
  })

  it('never throws on junk', () => {
    expect(filterByType(null, 'match')).toEqual([])
    expect(filterByType(undefined, 'match')).toEqual([])
    expect(filterByType([null], 'match')).toEqual([])
  })
})

describe('Schedule — the event-type filter row', () => {
  const typePill = (name) => screen.getByRole('button', { name })

  it('narrows Upcoming to training when Training is picked', async () => {
    const { user } = setup()

    // Both upcoming fixtures first, so the assertion after the click is a
    // change rather than a state that was already true.
    expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Training'))

    expect(screen.getByText('Senior squad training')).toBeInTheDocument()
    expect(screen.queryByText('Quins vs Dubai Exiles')).not.toBeInTheDocument()
    // The past-dated no-score match counts as Upcoming (a result is a score,
    // not an elapsed date) — so it is a match the type filter must also remove.
    expect(screen.queryByText('Quins vs Bahrain Warriors')).not.toBeInTheDocument()
  })

  it('narrows Upcoming to matches when Matches is picked', async () => {
    const { user } = setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Matches'))

    expect(screen.getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.queryByText('Senior squad training')).not.toBeInTheDocument()
  })

  it('brings everything back when Everything is picked again', async () => {
    const { user } = setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Matches'))
    expect(screen.queryByText('Senior squad training')).not.toBeInTheDocument()

    await user.click(typePill('Everything'))
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()
    expect(screen.getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
  })

  it('marks the picked pill as pressed and the others as not', async () => {
    const { user } = setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Socials'))

    expect(typePill('Socials')).toHaveAttribute('aria-pressed', 'true')
    expect(typePill('Everything')).toHaveAttribute('aria-pressed', 'false')
    expect(typePill('Matches')).toHaveAttribute('aria-pressed', 'false')
  })

  // ⚠️ "No upcoming fixtures yet" under a Socials filter reads as "the club
  // has nothing on" when there are two fixtures sitting behind the filter.
  it('says which filter emptied the list, not that there is nothing on', async () => {
    const { user } = setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Socials'))

    expect(screen.getByText(/no upcoming socials/i)).toBeInTheDocument()
    expect(screen.queryByText('No upcoming fixtures yet.')).not.toBeInTheDocument()
  })

  it('is shown to a parent, not just to admin and coaches', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    setup()

    expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(typePill('Training')).toBeInTheDocument()
    expect(typePill('Socials')).toBeInTheDocument()
  })

  // Results is by definition the fixtures carrying a score, so a "Training"
  // pill there would always empty the list; the calendar deliberately shows
  // the whole scope, same as the team filter.
  it('is absent on Results and on Calendar', async () => {
    const { user } = setup()
    expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Results' }))
    expect(screen.queryByRole('button', { name: 'Everything' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Socials' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(screen.queryByRole('button', { name: 'Everything' })).not.toBeInTheDocument()
  })

  it('does not filter Results, which keeps its scored fixture', async () => {
    const { user } = setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Training'))
    await user.click(screen.getByRole('button', { name: 'Results' }))

    expect(screen.getByText('Quins vs Al Ain Amblers')).toBeInTheDocument()
  })

  it('survives a reload, like the team filter', async () => {
    const { user, unmount } = setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

    await user.click(typePill('Training'))
    unmount()

    setup()
    expect(await screen.findByText('Senior squad training')).toBeInTheDocument()
    expect(screen.queryByText('Quins vs Dubai Exiles')).not.toBeInTheDocument()
    expect(typePill('Training')).toHaveAttribute('aria-pressed', 'true')
  })

  // ⚠️ A STORED VALUE THAT MATCHES NO EVENT TYPE must not strand the user on
  // an empty list. This is the shape a renamed type, or an older build's key,
  // actually arrives in.
  it('ignores a stored filter that is not one of the pills', async () => {
    window.localStorage.setItem('quins.schedule.typeFilter', 'tour')
    setup()

    expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.getByText('Senior squad training')).toBeInTheDocument()
    expect(typePill('Everything')).toHaveAttribute('aria-pressed', 'true')
  })

  // ⚠️ THE READ IS THE DANGEROUS SIDE. Safari with cookies blocked throws on
  // localStorage access, and this read happens in a useState initialiser —
  // i.e. during render. Uncaught, it does not degrade the filter, it takes
  // the whole Schedule screen down with a blank page.
  it('still renders when localStorage.getItem throws, as it does in Safari with cookies blocked', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    try {
      setup()

      expect(await screen.findByText('Quins vs Dubai Exiles')).toBeInTheDocument()
      expect(typePill('Everything')).toHaveAttribute('aria-pressed', 'true')
    } finally {
      getItem.mockRestore()
    }
  })

  // The write side. An uncaught throw here would NOT visibly break the filter
  // — setTypeFilter has already run by then, so the list is right either way —
  // which is exactly why it needs asserting on the error itself rather than on
  // the screen. An earlier version of this test checked the list, passed with
  // the try/catch deliberately removed, and was therefore decoration.
  it('swallows a localStorage.setItem throw instead of raising it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    // jsdom reports a throw inside an event listener as a window 'error'
    // event rather than propagating it to the caller, so the click below
    // resolves cleanly whether or not the throw was handled.
    const onError = vi.fn()
    window.addEventListener('error', onError)
    try {
      const { user } = setup()
      expect(await screen.findByText('Senior squad training')).toBeInTheDocument()

      await user.click(typePill('Training'))

      expect(onError).not.toHaveBeenCalled()
      expect(screen.queryByText('Quins vs Dubai Exiles')).not.toBeInTheDocument()
    } finally {
      window.removeEventListener('error', onError)
      setItem.mockRestore()
    }
  })
})

describe('Schedule — the section heading', () => {
  // Jay, 9 Aug 2026: "that area should say schedule, not schedule and
  // fixtures". The old wording said the same thing twice.
  it('reads "Schedule", not "Schedule & fixtures"', async () => {
    setup()

    const heading = await screen.findByRole('heading', { name: 'Schedule' })
    expect(heading).toBeInTheDocument()
    expect(screen.queryByText(/schedule\s*&\s*fixtures/i)).not.toBeInTheDocument()
  })
})
