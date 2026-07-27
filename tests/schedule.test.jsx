import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
}))

// Import after vi.mock so this binds to the mocked modules.
import Schedule from '../src/screens/Schedule.jsx'

const DAY = 24 * 60 * 60 * 1000

const days = (n) => new Date(Date.now() + n * DAY).toISOString()

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
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  listEventsMock.mockResolvedValue(ALL_EVENTS)
  subscribeEventsMock.mockReturnValue(unsubscribeEvents)
  listAvailabilityMock.mockResolvedValue([])
  subscribeAvailabilityMock.mockReturnValue(vi.fn())
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Schedule />)
  return { user, ...utils }
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
  it('queries only the teams the signed-in user can see', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(listEventsMock).toHaveBeenCalledWith({ teamIds: ['team-u10'] })
  })

  it('passes every visible team, in display order, for an admin', async () => {
    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(listEventsMock).toHaveBeenCalledWith({ teamIds: ['team-u10', 'team-1xv'] })
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

    await user.click(screen.getByRole('button', { name: 'U10' }))

    expect(screen.getByText('Quins vs Dubai Exiles')).toBeInTheDocument()
    expect(screen.queryByText('Senior squad training')).not.toBeInTheDocument()
  })

  it('hides the team filter when the user can only see one team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
  })
})

describe('Schedule — scope note', () => {
  it('tells a coach which squads they are seeing', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.getByText(/you're seeing u10/i)).toBeInTheDocument()
  })

  it('tells a parent their view is read-only', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
  })

  it('shows no scope note to an admin', async () => {
    setup()

    await screen.findByText('Quins vs Dubai Exiles')
    expect(screen.queryByText(/you're seeing/i)).not.toBeInTheDocument()
    expect(screen.getByText('All squads')).toBeInTheDocument()
  })
})

describe('Schedule — calendar tab', () => {
  const monthLabel = (offset = 0) => {
    const d = new Date()
    // Anchor to the 1st before shifting, so a 31st never rolls past a
    // 30-day month the way `setMonth` on the 31st would.
    d.setDate(1)
    d.setMonth(d.getMonth() + offset)
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

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
    const populated = cells.filter((cell) => cell.tagName === 'BUTTON')
    const empty = cells.filter((cell) => cell.tagName === 'DIV')

    // Guard the guard: if the month ever rendered only one variant, the
    // comparison below would pass vacuously.
    expect(populated.length).toBeGreaterThan(0)
    expect(empty.length).toBeGreaterThan(0)

    // `flex` overrides the UA's centred button layout; `items-start` and
    // `justify-start` then place the number top-left in both variants.
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
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
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
