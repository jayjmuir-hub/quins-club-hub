import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/screens/More.jsx (admin-dashboard plan, 2026-08-05).
// useMemberships is mocked so this exercises only the screen's own
// rendering. No network is reachable from this file — and that is itself
// part of the contract: More makes no query at all, everything it shows is
// already in the membership provider.
//
// This file replaces tests/admin.test.jsx. /more used to render the
// admin-only Admin overview, so three of the four roles got a "not
// authorised" card on their own tab; the whole point of the rewrite is that
// /more is now for everyone.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listParentsForPlayersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// ⚠️ THE "NO NETWORK FROM THIS SCREEN" CONTRACT CHANGED ON 6 AUG 2026.
// More now shows the person's own details and their linked players, so it
// reads the profile row, the players, their contacts and their parent rows.
// The header comment above is kept as history; these mocks are the new
// reality. Everything is still deterministic and nothing leaves the process.
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jay@example.com' } }),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ id: 'user-1', first_name: 'Jay', last_name: 'Muir' }),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: (...a) => listContactsForPlayersMock(...a),
}))

vi.mock('../src/data/parents.js', () => ({
  listParentsForPlayers: (...a) => listParentsForPlayersMock(...a),
}))

// The calendar card is a shared component with its own suite
// (tests/calendar-subscribe.test.jsx); stubbed so its network is not this
// file's problem.
vi.mock('../src/data/calendar.js', () => ({
  calendarFeedUrl: () => 'https://example.test/calendar.ics?token=t',
  calendarWebcalUrl: () => 'webcal://example.test/calendar.ics?token=t',
  myCalendarToken: vi.fn().mockResolvedValue('t'),
  resetMyCalendarToken: vi.fn(),
}))

// Import after vi.mock so this binds to the mocked module.
import More from '../src/screens/More.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

function renderMore() {
  return render(
    <MemoryRouter initialEntries={['/more']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <More />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Module-level cache — see the note in tests/dashboard.test.jsx.
  clearMyProfileCache()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  // Default: nothing linked. Individual tests opt in to players.
  //
  // ⚠️ ARRAYS, NOT MAPS, BECAUSE THAT IS WHAT THE REAL FUNCTIONS RETURN.
  // The first version of these mocks returned `{}` keyed by player id —
  // the shape the component's author assumed. Every test passed and the
  // panel shipped blank to production, because on a real array
  // `contacts[playerId]` is undefined. A mock that encodes the assumption
  // instead of the contract tests nothing.
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listParentsForPlayersMock.mockResolvedValue([])
})

// Added 6 Aug 2026 (Jay): "they should be able to see their info and any
// related player info too."
describe('More — your own details', () => {
  it('shows the name and email the club holds', async () => {
    renderMore()
    expect(await screen.findByTestId('your-name')).toHaveTextContent('Jay Muir')
    expect(screen.getByTestId('your-email')).toHaveTextContent('jay@example.com')
  })
})

describe('More — your players', () => {
  const PLAYER = {
    id: 'p1',
    full_name: 'Tom Muir',
    team_id: 'team-u10',
    position: 'Flanker',
    photo_path: null,
  }

  it('lists the player this account is attached to', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()

    const card = await screen.findByTestId('your-player')
    expect(within(card).getByText('Tom Muir')).toBeInTheDocument()
    expect(within(card).getByText(/U10 · Flanker/)).toBeInTheDocument()
  })

  it('shows the contact and parent rows the club holds', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])
    // Exactly the row shapes the real queries return — player_id on each row,
    // and NO phone/email on a parent row, because listParentsForPlayers
    // selects id, player_id, full_name, relationship, is_primary and nothing
    // else.
    listContactsForPlayersMock.mockResolvedValue([
      { player_id: 'p1', phone: '+971501234567', email: 'tom@example.com' },
    ])
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pa1', player_id: 'p1', full_name: 'Jay Muir', relationship: 'Father', is_primary: true },
    ])

    renderMore()
    const card = await screen.findByTestId('your-player')
    expect(within(card).getByText('tom@example.com')).toBeInTheDocument()
    expect(within(card).getByText('Jay Muir')).toBeInTheDocument()
    expect(within(card).getByText('Father')).toBeInTheDocument()
    // The phone is formatted, not printed raw.
    expect(within(card).getByText('+971 50 123 4567')).toBeInTheDocument()
  })

  it('groups rows by player when two children are linked', async () => {
    // ⚠️ The regression test for the shipped bug: with an ARRAY of rows
    // covering two players, each card must get its own. The broken version
    // rendered neither.
    useMembershipsMock.mockReturnValue(
      memberships([
        { id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' },
        { id: 'm4', role: 'parent', team_id: 'team-u10', player_id: 'p2' },
      ]),
    )
    listPlayersMock.mockResolvedValue([
      PLAYER,
      { id: 'p2', full_name: 'Sam Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])
    listContactsForPlayersMock.mockResolvedValue([
      { player_id: 'p1', phone: null, email: 'tom@example.com' },
      { player_id: 'p2', phone: null, email: 'sam@example.com' },
    ])

    renderMore()
    const cards = await screen.findAllByTestId('your-player')
    expect(cards).toHaveLength(2)

    const tom = cards.find((c) => within(c).queryByText('Tom Muir'))
    const sam = cards.find((c) => within(c).queryByText('Sam Muir'))
    expect(within(tom).getByText('tom@example.com')).toBeInTheDocument()
    expect(within(tom).queryByText('sam@example.com')).toBeNull()
    expect(within(sam).getByText('sam@example.com')).toBeInTheDocument()
  })

  it('says NOTHING when the contact row is withheld', async () => {
    // ⚠️ SAFEGUARDING, and the same rule PlayerDetail already follows.
    // player_contacts is a separate table precisely so RLS can withhold it.
    // A "contact details are hidden" note would confirm to someone who
    // cannot see the data that there IS data to see. So: no row, no note,
    // no lock icon.
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])
    listContactsForPlayersMock.mockResolvedValue([])

    renderMore()
    const card = await screen.findByTestId('your-player')
    expect(within(card).queryByText(/hidden|restricted|not available|no contact/i)).toBeNull()
    expect(within(card).queryByText('Phone')).toBeNull()
  })

  it('shows no players card at all for a coach with no child at the club', async () => {
    // An empty "Your players" heading implies something is missing.
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()
    await screen.findByTestId('your-name')

    expect(screen.queryByTestId('your-player')).not.toBeInTheDocument()
    expect(screen.queryByText(/your player/i)).not.toBeInTheDocument()
  })

  it('does not offer edit controls of its own', async () => {
    // ⚠️ Editing lives in the existing self-service flow, which the database
    // restricts to photo, contact and parent rows. A second implementation
    // here could drift from that and offer a write RLS refuses.
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()
    const card = await screen.findByTestId('your-player')

    expect(within(card).queryByRole('textbox')).toBeNull()
    expect(within(card).getByRole('link', { name: /view or change/i })).toHaveAttribute('href', '/roster')
  })
})

describe('More — for every role', () => {
  it('renders a real More screen for a parent, not a not-authorised card', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('renders a real More screen for a coach, not a not-authorised card', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('shows the role label and the squads the person can see', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.getByTestId('your-role')).toHaveTextContent('Parent')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10')
    // A parent of a U10 player must not be told they can see the 1st XV.
    expect(screen.getByTestId('your-squads')).not.toHaveTextContent('Senior Men 1st XV')
  })

  it('shows every squad for an admin, in sort order', () => {
    renderMore()

    expect(screen.getByTestId('your-role')).toHaveTextContent('Admin')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10 · Senior Men 1st XV')
  })

  it('says so plainly when the person can see no squads yet', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH, []))

    renderMore()

    expect(screen.getByTestId('your-squads')).toHaveTextContent(/no squads yet/i)
  })
})

describe('More — the Admin link', () => {
  it('offers an Admin link to an admin, pointing at /admin', () => {
    renderMore()

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  it('does not offer an Admin link to a coach', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('does not offer an Admin link to a parent', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})

describe('More — what it deliberately does NOT do', () => {
  // The duplication this plan exists to remove: /more used to list every
  // club member read-only while /accounts listed the same rows with write
  // controls. The Accounts tab is now the only place club members appear.
  it('does not list club members', () => {
    renderMore()

    expect(screen.queryAllByTestId('member-row')).toHaveLength(0)
    expect(screen.queryByText(/club members/i)).not.toBeInTheDocument()
  })

  // ⚠️ Sign-out is rendered by AppShell on this route, not by this screen.
  // If it ever moves in here, the guard in tests/app.test.jsx (a parent
  // signing out through the real App) is what keeps it working; this only
  // pins the current division of labour.
  it('does not render its own sign-out control', () => {
    renderMore()

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})
