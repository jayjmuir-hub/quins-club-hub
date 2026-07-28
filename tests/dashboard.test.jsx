import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/screens/Dashboard.jsx (Task 13). useMemberships and both
// data modules are mocked, so this exercises only the screen's own behaviour —
// scoping both queries to the user's visible teams, choosing the next fixture,
// the countdown, the stat tiles, the upcoming list, the last result, the
// edit-gated quick actions, and the loading/empty/error contract. No network is
// ever reachable from this file.
//
// The clock is pinned by spying on Date.now rather than with
// vi.useFakeTimers(): RTL's waitFor does not detect Vitest's fake timers (its
// jestFakeTimersAreEnabled() check looks for a global `jest`), so fake timers
// make every findBy*/waitFor hang. Date.now is the only clock the Dashboard
// reads, and pinning it is what makes the countdown assertions exact instead
// of racing the real second hand.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const upsertEventMock = vi.fn()
const deleteEventMock = vi.fn()
const listPlayersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
  // Task 14 wired the detail sheet's Edit/Delete footer and the event form
  // into this screen too. Stubbed so a mis-wiring would fail loudly here
  // rather than reaching an undefined import at call time.
  upsertEvent: (...args) => upsertEventMock(...args),
  deleteEvent: (...args) => deleteEventMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

// Only reached when a fixture row opens EventDetail; mocked so this file
// stays network-free either way. EventDetail's own behaviour is covered by
// tests/schedule.test.jsx.
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

// Import after vi.mock so this binds to the mocked modules.
import Dashboard from '../src/screens/Dashboard.jsx'

// 2026-07-20T09:00 Abu Dhabi — the prototype's own demo "now"
// (design-system.md §4.11), so the fixture below reproduces the documented
// "4 Days / 8 Hrs / 0 Min" hero exactly.
const NOW = Date.parse('2026-07-20T05:00:00Z')

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const COACH = [
  { id: 'm1', role: 'coach', team_id: 'team-u10' },
  { id: 'm2', role: 'coach', team_id: 'team-1xv' },
]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]
const ADMIN = [{ id: 'm0', role: 'admin', team_id: null }]
const PLAYER = [{ id: 'm5', role: 'player', team_id: 'team-u10', player_id: 'p1' }]
// A coach row with no resolvable team. canEditTeam refuses it deliberately;
// a raw `role === 'coach'` check would grant on it.
const TEAMLESS_COACH = [{ id: 'm6', role: 'coach', team_id: null }]

// 2026-07-24T13:00Z = 17:00 Abu Dhabi = 4 days 8 hours after NOW.
const NEXT_MATCH = {
  id: 'e-match',
  team_id: 'team-1xv',
  type: 'match',
  opponent: 'Al Ain Amblers',
  starts_at: '2026-07-24T13:00:00Z',
  venue: 'Zayed Sports City',
  home: true,
  result_us: null,
  result_them: null,
}
// Sooner than the match, but training — the hero must still prefer the match.
const SOONER_TRAINING = {
  id: 'e-training',
  team_id: 'team-u10',
  type: 'training',
  title: 'U10 skills session',
  starts_at: '2026-07-21T15:30:00Z',
  venue: 'Zayed Sports City',
  result_us: null,
  result_them: null,
}
// Kicked off before NOW and nobody has entered a score. Schedule's Upcoming
// tab keeps this visible on purpose (it still needs a score), but the
// Dashboard asks a calendar question — what is coming up — so it must not
// appear here at all.
const PAST_UNSCORED = {
  id: 'e-stale',
  team_id: 'team-u10',
  type: 'match',
  opponent: 'Dubai Exiles',
  starts_at: '2026-07-15T13:00:00Z',
  result_us: null,
  result_them: null,
}
const LAST_RESULT = {
  id: 'e-result',
  team_id: 'team-1xv',
  type: 'match',
  opponent: 'Jebel Ali Dragons',
  starts_at: '2026-07-10T13:00:00Z',
  result_us: 31,
  result_them: 19,
}
const OLDER_RESULT = {
  id: 'e-older',
  team_id: 'team-u10',
  type: 'match',
  opponent: 'Sharjah Wanderers',
  starts_at: '2026-07-03T13:00:00Z',
  result_us: 10,
  result_them: 20,
}

// A training or a social can NEVER carry a score, so under a hasResult-based
// filter this one would sit at the top of "Upcoming" and inflate the
// fixtures-to-play count forever. It is the case that exposed the split
// between "still needs a score" and "still to come".
const PAST_SOCIAL = {
  id: 'e-social',
  team_id: 'team-u10',
  type: 'social',
  title: 'Season launch barbecue',
  starts_at: '2026-07-04T14:00:00Z',
  result_us: null,
  result_them: null,
}

const EVENTS = [
  NEXT_MATCH,
  SOONER_TRAINING,
  PAST_UNSCORED,
  PAST_SOCIAL,
  LAST_RESULT,
  OLDER_RESULT,
]

const PLAYERS = [
  { id: 'p1', team_id: 'team-u10', full_name: 'Amir Haddad', position: 'Prop' },
  { id: 'p2', team_id: 'team-u10', full_name: 'Bea Okoro', position: 'Wing' },
  { id: 'p3', team_id: 'team-1xv', full_name: 'Cal Fletcher', position: 'Lock' },
]

function membershipValue(memberships, teams = TEAMS) {
  return { memberships, teams, loading: false, error: null, reload: vi.fn() }
}

// Intl separates the time from AM/PM with U+202F (narrow no-break space) in
// current Node, which no plain-space assertion would match.
function heroText(node) {
  return node.textContent.replace(/[\u202f\u00a0]/g, ' ')
}

function renderDashboard() {
  return render(
    // Same future flags App.jsx sets on its BrowserRouter — without them
    // react-router logs two upgrade warnings per render into the suite's
    // stderr.
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Dashboard />
    </MemoryRouter>,
  )
}

let nowSpy
let setIntervalSpy

beforeEach(() => {
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW)
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  useMembershipsMock.mockReset()
  listEventsMock.mockReset()
  subscribeEventsMock.mockReset()
  listPlayersMock.mockReset()

  useMembershipsMock.mockReturnValue(membershipValue(COACH))
  listEventsMock.mockResolvedValue(EVENTS)
  listPlayersMock.mockResolvedValue(PLAYERS)
  subscribeEventsMock.mockReturnValue(() => {})
})

afterEach(() => {
  nowSpy.mockRestore()
  setIntervalSpy.mockRestore()
})

describe('Dashboard — loading, scoping and errors', () => {
  it('shows a spinner on first load and nothing else', () => {
    listEventsMock.mockReturnValue(new Promise(() => {}))
    listPlayersMock.mockReturnValue(new Promise(() => {}))

    renderDashboard()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/Quins vs/)).not.toBeInTheDocument()
  })

  it('asks for events and players scoped to the visible teams only', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(listEventsMock).toHaveBeenCalledWith({ teamIds: ['team-u10', 'team-1xv'] })
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u10', 'team-1xv'] })
  })

  it('asks for no teams rather than everything when the scope is empty', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(COACH, []))
    // The real modules return [] for an empty teamIds array; the mocks must
    // too, or this would assert against data no such user could ever receive.
    listEventsMock.mockResolvedValue([])
    listPlayersMock.mockResolvedValue([])

    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)

    expect(listEventsMock).toHaveBeenCalledWith({ teamIds: [] })
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: [] })
  })

  it('renders an error region with a working retry', async () => {
    listEventsMock.mockRejectedValueOnce(new Error('Network unreachable'))

    renderDashboard()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Network unreachable/)).toBeInTheDocument()

    listEventsMock.mockResolvedValue(EVENTS)
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('stat-players')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the rendered content on screen while a realtime refresh is in flight', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    const refresh = subscribeEventsMock.mock.calls[0][0]
    // Both refetches hang, so the screen is in the "loading again" state for
    // the whole of the assertions below.
    listEventsMock.mockReturnValue(new Promise(() => {}))
    listPlayersMock.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      refresh()
    })

    expect(screen.getByTestId('next-fixture')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Dashboard — next fixture hero', () => {
  it('shows the next upcoming match, not the sooner training session', async () => {
    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    expect(within(hero).getByText('Quins vs Al Ain Amblers')).toBeInTheDocument()
    expect(within(hero).getByText(/Senior Men 1st XV/)).toBeInTheDocument()
    expect(within(hero).queryByText(/skills session/i)).not.toBeInTheDocument()
  })

  it('renders the kick-off in Abu Dhabi time, not the browser zone', async () => {
    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    // 2026-07-24T13:00Z is 17:00 in Abu Dhabi. Any browser-local rendering
    // would print a different hour under a non-UTC TZ.
    expect(heroText(hero)).toContain('5:00 PM')
    expect(heroText(hero)).toMatch(/Jul 24, 2026|24 Jul 2026/)
  })

  it('rolls the hero date over on Abu Dhabi\u2019s midnight, not the reader\u2019s', async () => {
    // 20:30 UTC on 24 Jul is 00:30 on 25 Jul in Abu Dhabi — a different
    // calendar day from UTC (the test runner's zone) and from New York. Only
    // a club-zone formatter prints the 25th and a 12:30 AM kick-off here, so
    // this assertion fails under any browser-local rendering whatever TZ the
    // suite runs in.
    listEventsMock.mockResolvedValue([
      { ...NEXT_MATCH, starts_at: '2026-07-24T20:30:00Z' },
    ])

    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    expect(heroText(hero)).toContain('12:30 AM')
    expect(heroText(hero)).toMatch(/Jul 25, 2026|25 Jul 2026/)
  })

  it('badges a home match as home and an away one as away', async () => {
    renderDashboard()
    expect(within(await screen.findByTestId('next-fixture')).getByText('Home')).toBeInTheDocument()
  })

  it('badges an away match as away', async () => {
    listEventsMock.mockResolvedValue([{ ...NEXT_MATCH, home: false }])

    renderDashboard()
    expect(within(await screen.findByTestId('next-fixture')).getByText('Away')).toBeInTheDocument()
  })

  it('counts down to the kick-off instant', async () => {
    renderDashboard()

    const countdown = await screen.findByTestId('countdown')
    expect(within(countdown).getByTestId('countdown-days')).toHaveTextContent('4')
    expect(within(countdown).getByTestId('countdown-hours')).toHaveTextContent('8')
    expect(within(countdown).getByTestId('countdown-minutes')).toHaveTextContent('0')
  })

  it('falls back to the next event of any type when no match is upcoming', async () => {
    listEventsMock.mockResolvedValue([SOONER_TRAINING, LAST_RESULT])

    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    expect(within(hero).getByText('U10 skills session')).toBeInTheDocument()
  })

  it('never picks a fixture that has already kicked off, even unscored', async () => {
    listEventsMock.mockResolvedValue([PAST_UNSCORED, LAST_RESULT])

    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)

    // A countdown to an instant that has already passed is meaningless.
    expect(screen.queryByTestId('next-fixture')).not.toBeInTheDocument()
  })

  it('only runs the once-a-minute countdown tick while there is a hero', async () => {
    // Filtered to the countdown's own 60s delay so nothing React or RTL
    // schedules internally can make this pass by accident.
    const ticks = () =>
      setIntervalSpy.mock.calls.filter(([, delay]) => delay === 60 * 1000).length

    const { unmount } = renderDashboard()
    await screen.findByTestId('next-fixture')
    expect(ticks()).toBe(1)
    unmount()

    setIntervalSpy.mockClear()
    listEventsMock.mockResolvedValue([LAST_RESULT])
    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)
    // Nothing to count down to, so nothing to re-render the dashboard for.
    expect(ticks()).toBe(0)
  })

  it('hides the hero entirely when there is nothing upcoming', async () => {
    listEventsMock.mockResolvedValue([LAST_RESULT])

    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)

    expect(screen.queryByTestId('next-fixture')).not.toBeInTheDocument()
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument()
  })
})

describe('Dashboard — stats', () => {
  it('counts players in scope, fixtures still to play, and age groups', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByTestId('stat-players')).toHaveTextContent('3')
    // Only NEXT_MATCH and SOONER_TRAINING are still to come. The two scored
    // fixtures are results; PAST_UNSCORED and PAST_SOCIAL have already
    // happened, whether or not anyone can ever score them.
    expect(screen.getByTestId('stat-fixtures')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-groups')).toHaveTextContent('2')
  })

  it('labels the tiles for the whole club when the user is an admin', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(ADMIN))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByTestId('stat-players')).toHaveTextContent(/registered players/i)
    expect(screen.getByTestId('stat-groups')).toHaveTextContent(/age groups/i)
  })

  it('labels the tiles as the user’s own slice when they are not an admin', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByTestId('stat-players')).toHaveTextContent(/players in view/i)
    expect(screen.getByTestId('stat-groups')).toHaveTextContent(/your groups/i)
  })
})

describe('Dashboard — upcoming list and last result', () => {
  it('lists the fixtures still to play, soonest first, capped at five', async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `e-${index}`,
      team_id: 'team-u10',
      type: 'training',
      title: `Session ${index}`,
      starts_at: new Date(NOW + (index + 1) * 86400000).toISOString(),
      result_us: null,
      result_them: null,
    }))
    listEventsMock.mockResolvedValue([...many].reverse())

    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    const titles = within(list)
      .getAllByTestId('fixture-title')
      .map((node) => node.textContent)
    expect(titles).toEqual(['Session 0', 'Session 1', 'Session 2', 'Session 3', 'Session 4'])
  })

  // Task 14. The dashboard opens the same EventDetail as the schedule, so it
  // has to pass the same canEdit/onEdit wiring — without it a coach tapping a
  // fixture here is told, untruthfully, that the event is read-only.
  it('gives a coach the Edit and Delete actions in the detail sheet', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    await userEvent.click(within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('tells a parent the detail sheet is read-only instead', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    await userEvent.click(within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(dialog).getByText(/read-only/i)).toBeInTheDocument()
  })

  it('opens the edit form from the detail sheet', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    await userEvent.click(within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
  })

  it('opens the event detail sheet when a fixture row is tapped', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    const row = within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]')
    await userEvent.click(row)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/U10 skills session/)).toBeInTheDocument()
  })

  // The Dashboard asks "what's coming up", not "what still needs a score".
  // Those coincide for matches and diverge completely for trainings and
  // socials, which can never be scored — so a hasResult-based filter left
  // stale ones on the list and in the count indefinitely.
  it('leaves stale unscored events out of both the list and the count', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    const titles = within(list)
      .getAllByTestId('fixture-title')
      .map((node) => node.textContent)

    // Both future events, nothing else.
    expect(titles).toEqual(['U10 skills session', 'Quins vs Al Ain Amblers'])
    // A week-old social, which can never carry a score…
    expect(titles).not.toContain('Season launch barbecue')
    // …and a match played last week that nobody has scored yet. That one is
    // still on Schedule's Upcoming tab by design; it is not this screen's
    // question.
    expect(titles).not.toContain('Quins vs Dubai Exiles')

    expect(screen.getByTestId('stat-fixtures')).toHaveTextContent('2')
  })

  it('shows the most recent scored fixture as the last result', async () => {
    renderDashboard()

    const block = await screen.findByTestId('last-result')
    expect(within(block).getByText('Quins vs Jebel Ali Dragons')).toBeInTheDocument()
    expect(within(block).getByText('31–19')).toBeInTheDocument()
    expect(within(block).queryByText(/Sharjah Wanderers/)).not.toBeInTheDocument()
  })

  it('says so when no scores have been entered yet', async () => {
    listEventsMock.mockResolvedValue([NEXT_MATCH])

    renderDashboard()

    const block = await screen.findByTestId('last-result')
    expect(within(block).getByText(/no results yet/i)).toBeInTheDocument()
  })
})

describe('Dashboard — quick actions', () => {
  // The card holds exactly the actions a role may take. Asserting on the full
  // set, not on one button at a time, is what makes these fail if a
  // not-yet-built action is ever added back: getByRole('button') matches a
  // disabled button just as happily as an enabled one, so "the add button is
  // present" proves nothing about whether it works.
  const actionNames = () =>
    within(screen.getByTestId('quick-actions'))
      .getAllByRole('link')
      .concat(within(screen.getByTestId('quick-actions')).queryAllByRole('button'))
      .map((node) => node.textContent.trim())

  it('offers a coach navigation only — no add actions until Tasks 14/15 build them', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(actionNames()).toEqual(['View full schedule', 'View team list'])
  })

  it('offers an admin the same, and no read-only explanation', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(ADMIN))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(actionNames()).toEqual(['View full schedule', 'View team list'])
    expect(screen.queryByText(/you're signed in as a/i)).not.toBeInTheDocument()
  })

  it('offers a parent navigation only, and says why', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(actionNames()).toEqual(['View schedule', 'View team list'])
    expect(screen.getByText(/signed in as a parent/i)).toBeInTheDocument()
  })

  // A player is one of the four supported roles, and used to be told they
  // were a parent — twelve lines below a scope note reading "Player view".
  it('calls a player a player, not a parent', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PLAYER))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(actionNames()).toEqual(['View schedule', 'View team list'])
    expect(screen.getByText(/signed in as a player/i)).toBeInTheDocument()
    expect(screen.queryByText(/signed in as a parent/i)).not.toBeInTheDocument()
  })

  it('treats a coach with no resolvable team as read-only', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(TEAMLESS_COACH))
    listEventsMock.mockResolvedValue([])
    listPlayersMock.mockResolvedValue([])

    renderDashboard()
    await screen.findByTestId('stat-players')

    // canEditTeam refuses a null team_id, so this coach gets the read-only
    // card rather than an action pointing at a form with no squad to pick.
    expect(actionNames()).toEqual(['View schedule', 'View team list'])
    expect(screen.getByText(/signed in as a coach/i)).toBeInTheDocument()
  })

  it('links to the full schedule and the team list', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/schedule')
    expect(screen.getByRole('link', { name: /team list/i })).toHaveAttribute('href', '/roster')
  })
})
