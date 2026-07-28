import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Admin.jsx (Task 17). useMemberships and both
// data modules are mocked, so this exercises only the screen's own
// behaviour — the admin gate, the loading/empty/error contract, and the
// teams/players/members lists it renders. No network is ever reachable
// from this file.
//
// The gate is the whole point of this screen (see the brief): a non-admin
// must see a clear "not authorised" message and never any admin data —
// asserted below by checking neither data module is ever called for a
// non-admin, not just that their output isn't on screen.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listClubMembersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

vi.mock('../src/data/members.js', () => ({
  listClubMembers: (...args) => listClubMembersMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Admin from '../src/screens/Admin.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; Admin sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

const FLANKER = { id: 'p-flanker', team_id: 'team-u10', full_name: 'Tom Fletcher', position: 'Flanker' }
const SENIOR = { id: 'p-fullback', team_id: 'team-1xv', full_name: 'Craig Muir', position: 'Fullback' }
const ALL_PLAYERS = [FLANKER, SENIOR]

const MEMBER_ROWS = [
  { id: 'mem-1', role: 'coach', team_id: 'team-u10', profiles: { full_name: 'Sara Coach' }, teams: { name: 'U10' } },
  { id: 'mem-2', role: 'admin', team_id: null, profiles: { full_name: 'Jay Muir' }, teams: null },
  { id: 'mem-3', role: 'parent', team_id: 'team-1xv', profiles: { full_name: 'Ali Parent' }, teams: { name: 'Senior Men 1st XV' } },
]

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  listPlayersMock.mockResolvedValue(ALL_PLAYERS)
  listClubMembersMock.mockResolvedValue(MEMBER_ROWS)
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Admin />)
  return { user, ...utils }
}

describe('Admin — authorisation gate', () => {
  it('renders the overview for an admin', async () => {
    setup()

    expect(await screen.findByRole('heading', { name: /admin overview/i })).toBeInTheDocument()
  })

  it('renders a not-authorised message for a coach, with no admin data', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(screen.queryByRole('heading', { name: /admin overview/i })).not.toBeInTheDocument()
    expect(listPlayersMock).not.toHaveBeenCalled()
    expect(listClubMembersMock).not.toHaveBeenCalled()
  })

  it('renders a not-authorised message for a parent, with no admin data', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(listPlayersMock).not.toHaveBeenCalled()
    expect(listClubMembersMock).not.toHaveBeenCalled()
  })

  it('renders a not-authorised message for someone with no memberships at all', async () => {
    useMembershipsMock.mockReturnValue(memberships([]))

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
  })
})

describe('Admin — loading, empty and error states', () => {
  it('shows a loading state while the queries are in flight', () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}))
    listClubMembersMock.mockReturnValue(new Promise(() => {}))

    setup()

    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
  })

  it('shows empty states when the club has no players or members yet', async () => {
    listPlayersMock.mockResolvedValue([])
    listClubMembersMock.mockResolvedValue([])

    setup()

    expect(await screen.findByText(/no club members yet/i)).toBeInTheDocument()
  })

  it('renders a failed query in an alert region, with a retry', async () => {
    listPlayersMock.mockRejectedValue(new Error('Network unreachable'))

    const { user } = setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/network unreachable/i)).toBeInTheDocument()

    listPlayersMock.mockResolvedValue(ALL_PLAYERS)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Admin — content', () => {
  it('queries club-wide, with no team filter', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(listPlayersMock).toHaveBeenCalledWith()
    expect(listClubMembersMock).toHaveBeenCalledWith()
  })

  it('lists every age group with its player count', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.getAllByText('U10').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 player').length).toBe(2)
    expect(screen.getAllByText('Senior Men 1st XV').length).toBeGreaterThan(0)
  })

  it('lists every club member with their role and team', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.getByText('Jay Muir')).toBeInTheDocument()
    expect(screen.getByText('Ali Parent')).toBeInTheDocument()

    const rows = screen.getAllByTestId('member-row')
    expect(rows).toHaveLength(3)
  })

  it('shows the summary counts', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.getByText(/2 age groups/i)).toBeInTheDocument()
    expect(screen.getByText(/2 players/i)).toBeInTheDocument()
    expect(screen.getByText(/3 members/i)).toBeInTheDocument()
  })

  it('offers manage links to the roster and schedule', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.getByRole('link', { name: /manage roster/i })).toHaveAttribute('href', '/roster')
    expect(screen.getByRole('link', { name: /manage schedule/i })).toHaveAttribute('href', '/schedule')
  })

  it('does not use jersey numbers on club member rows', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.queryByText(/jersey/i)).not.toBeInTheDocument()
  })
})
