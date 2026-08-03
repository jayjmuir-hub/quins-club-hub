import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Overview.jsx (Club Overview Dashboard plan,
// Task 3). useMemberships and the src/data/* modules this screen calls are
// mocked, so this exercises only the screen's own behaviour — scoping the
// query to the user's visible teams, the three sections (upcoming fixtures,
// RSVP status, roster gaps), and the loading/empty/error contract. No
// network is ever reachable from this file.
//
// Mocking pattern copied from tests/schedule.test.jsx / tests/roster.test.jsx:
// module-level vi.fn()s, vi.mock() wiring each real export to one of them,
// and a memberships(rows, teams) fixture helper shaped exactly like
// useMemberships()'s real return value ({ memberships, teams, loading,
// error, reload }).

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const listAvailabilityForEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
// EventDetail.jsx's own AvailabilitySummary subcomponent calls
// listAvailability/subscribeAvailability directly (Task 11's contract,
// unrelated to this screen's bulk listAvailabilityForEvents) — mocked here
// only so the detail-sheet test below can mount EventDetail without hitting
// the real (unmocked) module.
const listAvailabilityMock = vi.fn()
const subscribeAvailabilityMock = vi.fn()

// FEATURES.availability gates the RSVP-status section (src/screens/Overview.jsx,
// same flag EventDetail.jsx already respects — off club-wide since 2026-07-29).
// Mutable mock object pattern copied from tests/schedule.test.jsx: vi.mock's
// factory is hoisted above top-level consts, so a plain const here would be
// undefined inside the factory — vi.hoisted gives us a real object reference
// both the factory and the tests below can share and mutate per-test.
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
  listAvailabilityForEvents: (...args) => listAvailabilityForEventsMock(...args),
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: (...args) => subscribeAvailabilityMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  listContactsForPlayers: (...args) => listContactsForPlayersMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Overview from '../src/screens/Overview.jsx'

const TEAM_U12 = { id: 't1', name: 'U12 Boys', sort_order: 4 }
const TEAM_U14 = { id: 't2', name: 'U14 Boys', sort_order: 6 }
const TEAMS = [TEAM_U14, TEAM_U12] // deliberately unsorted; visibleTeams sorts

const ADMIN_MEMBERSHIPS = [{ id: 'm0', role: 'admin', team_id: null, player_id: null }]
const COACH_MEMBERSHIPS = [{ id: 'm1', role: 'coach', team_id: 't1', player_id: null }]

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

const unsubscribeEvents = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Default true so the existing "Overview sections" RSVP tests below keep
  // exercising the built feature; the real current default (false) gets its
  // own describe block further down.
  featuresMock.availability = true
  useMembershipsMock.mockReturnValue(memberships(ADMIN_MEMBERSHIPS))
  listEventsMock.mockResolvedValue([])
  subscribeEventsMock.mockReturnValue(unsubscribeEvents)
  listAvailabilityForEventsMock.mockResolvedValue([])
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listAvailabilityMock.mockResolvedValue([])
  subscribeAvailabilityMock.mockReturnValue(vi.fn())
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Overview />)
  return { user, ...utils }
}

describe('Overview scoping', () => {
  it('admin: requests events/players across every team', async () => {
    setup()

    await screen.findByText(/no upcoming fixtures/i)
    const call = listEventsMock.mock.calls[0][0]
    expect(call.teamIds).toEqual(expect.arrayContaining(['t1', 't2']))
    expect(call.teamIds).toHaveLength(2)
  })

  it('coach: requests events/players scoped to only their own team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_MEMBERSHIPS))

    setup()

    await screen.findByText(/no upcoming fixtures/i)
    const call = listEventsMock.mock.calls[0][0]
    expect(call.teamIds).toEqual(['t1'])
  })
})

describe('Overview sections', () => {
  it('renders the upcoming-fixtures section with a fixture row', async () => {
    listEventsMock.mockResolvedValue([
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

    setup()

    expect(await screen.findByTestId('fixture-row')).toBeInTheDocument()
  })

  it('renders an RSVP status summary for a fixture with responses', async () => {
    listEventsMock.mockResolvedValue([
      { id: 'e1', team_id: 't1', type: 'match', starts_at: '2099-01-10T15:00:00Z' },
    ])
    listAvailabilityForEventsMock.mockResolvedValue([
      { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'in' },
      { id: 'a2', event_id: 'e1', player_id: 'p2', status: 'in' },
      { id: 'a3', event_id: 'e1', player_id: 'p3', status: 'maybe' },
    ])

    setup()

    expect(await screen.findByTestId('rsvp-summary-e1')).toHaveTextContent('2 In')
    expect(screen.getByTestId('rsvp-summary-e1')).toHaveTextContent('1 Maybe')
  })

  it('renders roster gaps: player count and missing-contact count per team', async () => {
    listPlayersMock.mockResolvedValue([
      { id: 'p1', team_id: 't1', full_name: 'Alex' },
      { id: 'p2', team_id: 't1', full_name: 'Sam' },
    ])
    listContactsForPlayersMock.mockResolvedValue([{ player_id: 'p1', phone: '123', email: null }])

    setup()

    const row = await screen.findByTestId('roster-gap-t1')
    expect(row).toHaveTextContent('2') // player count
    expect(row).toHaveTextContent('1') // missing-contact count (p2 has no row)
  })

  it('shows an empty state when there are no upcoming fixtures', async () => {
    setup()

    expect(await screen.findByText(/no upcoming fixtures/i)).toBeInTheDocument()
  })

  it('shows a retry-able error card when a fetch fails', async () => {
    listEventsMock.mockRejectedValue(new Error('network down'))

    setup()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('Overview — RSVP section respects FEATURES.availability', () => {
  it('flag off (the real current default): never fetches availability and hides the RSVP summary', async () => {
    featuresMock.availability = false
    listEventsMock.mockResolvedValue([
      { id: 'e1', team_id: 't1', type: 'match', starts_at: '2099-01-10T15:00:00Z' },
    ])

    setup()

    expect(await screen.findByTestId('fixture-row')).toBeInTheDocument()
    expect(screen.queryByTestId('rsvp-summary-e1')).not.toBeInTheDocument()
    expect(listAvailabilityForEventsMock).not.toHaveBeenCalled()
  })
})

describe('Overview — fixture detail sheet', () => {
  it('opens the detail sheet for a fixture on click', async () => {
    listEventsMock.mockResolvedValue([
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

    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/ }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Zayed Sports City')).toBeInTheDocument()
  })
})
