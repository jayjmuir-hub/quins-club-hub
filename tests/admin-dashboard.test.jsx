import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Unit tests for src/screens/AdminDashboard.jsx and src/screens/AdminClub.jsx
// (admin-dashboard plan, 2026-08-05). useMemberships, useAuth and the data
// modules are mocked, so this exercises only the two screens' own behaviour:
// the admin gate, the tab routing, and the Club tab's counts. No network is
// reachable from this file.
//
// The Accounts tab is stubbed to a marker below rather than mounting the real
// Accounts.jsx: that screen's behaviour is already covered by
// tests/accounts.test.jsx (which renders it directly and is untouched by this
// plan), and what matters here is only that the tab routing reaches it. That
// it is genuinely reachable through the real router is proved in
// tests/app.test.jsx, which mounts the real thing.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listClubMembersMock = vi.fn()
const createInviteMock = vi.fn()
const listAllLeagueTeamsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// AdminClub renders InviteForm in a Sheet; InviteForm reads useAuth for the
// inviting admin's id and calls createInvite. Its own behaviour is covered by
// tests/invite-form.test.jsx.
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  listContactsForPlayers: (...args) => listContactsForPlayersMock(...args),
}))

// listClubMembers is mocked purely so the "Club tab does not list club
// members" assertion below can be made against the QUERY, not just the DOM.
vi.mock('../src/data/members.js', () => ({
  listClubMembers: (...args) => listClubMembersMock(...args),
  createInvite: (...args) => createInviteMock(...args),
}))

// AdminClub reads the club's league teams into the Age groups list. Their own
// behaviour is covered by tests/admin-club-league-teams.test.jsx; mocked here
// so this file stays unable to reach the network.
vi.mock('../src/data/leagueTeams.js', () => ({
  listAllLeagueTeams: (...args) => listAllLeagueTeamsMock(...args),
  upsertLeagueTeam: vi.fn(),
  setLeagueTeamActive: vi.fn(),
}))

// Import after vi.mock so these bind to the mocked modules.
import AdminDashboard from '../src/screens/AdminDashboard.jsx'
import AdminClub from '../src/screens/AdminClub.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12 Boys', sort_order: 6 }
const TEAMS = [TEAM_U12, TEAM_U10] // deliberately unsorted; the screen sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

// Two U10 players, one U12. Only Zara has a contact row, so U10 has exactly
// one gap and U12 has exactly one — different numbers from the player counts,
// so a test asserting the gap can't accidentally pass by matching the count.
const ZARA = { id: 'player-zara', team_id: 'team-u10', full_name: 'Zara Ali' }
const TOM = { id: 'player-tom', team_id: 'team-u10', full_name: 'Tom Fletcher' }
const OMAR = { id: 'player-omar', team_id: 'team-u12', full_name: 'Omar Ali' }
const ALL_PLAYERS = [ZARA, TOM, OMAR]
const CONTACTS = [{ player_id: 'player-zara' }]

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

// The real route shape from App.jsx: AdminDashboard is the parent, the two
// tabs are child routes rendering through its <Outlet/>.
function renderAdmin(path = '/admin/accounts') {
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />}>
          <Route path="accounts" element={<div>Accounts tab marker</div>} />
          <Route path="club" element={<AdminClub />} />
        </Route>
        <Route path="/roster" element={<div>Roster screen marker</div>} />
        <Route path="/schedule" element={<div>Schedule screen marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user, ...utils }
}

function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
  listPlayersMock.mockResolvedValue(ALL_PLAYERS)
  listContactsForPlayersMock.mockResolvedValue(CONTACTS)
  listClubMembersMock.mockResolvedValue([])
  listAllLeagueTeamsMock.mockResolvedValue([])
})

describe('AdminDashboard — authorisation gate', () => {
  it('renders the dashboard for an admin', () => {
    renderAdmin()

    // Both tabs plus the routed tab content — NOT the heading, which
    // NotAuthorised also renders (sr-only), so it cannot tell the two apart.
    expect(screen.getByRole('link', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Club' })).toBeInTheDocument()
    expect(screen.getByText('Accounts tab marker')).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('refuses a coach, and issues no query', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderAdmin('/admin/club')

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    // The tabs, not the heading: NotAuthorised carries its own sr-only
    // <h2>Admin</h2> for screen readers, so a heading query matches in both
    // the refused and the allowed case and proves nothing.
    expect(screen.queryByRole('link', { name: 'Club' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
    expect(listPlayersMock).not.toHaveBeenCalled()
    expect(listContactsForPlayersMock).not.toHaveBeenCalled()
  })

  it('refuses a parent', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderAdmin()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(listPlayersMock).not.toHaveBeenCalled()
  })

  it('refuses someone with no memberships at all', () => {
    useMembershipsMock.mockReturnValue(memberships([]))

    renderAdmin()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
  })

  // The gate reads the EFFECTIVE membership set, which is what
  // useMemberships() returns while a preview is active (see
  // ViewAsSwitcher.jsx) — a real admin previewing as a coach gets the coach's
  // rows here, and must lose the screen. This is the same rule Accounts.jsx
  // has always followed.
  it('refuses an admin who is previewing as a coach', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderAdmin('/admin/accounts')

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(screen.queryByText('Accounts tab marker')).not.toBeInTheDocument()
  })
})

describe('AdminDashboard — tabs', () => {
  it('renders exactly two tabs, Accounts and Club, as real links', () => {
    renderAdmin()

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(tabs.querySelectorAll('a')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/admin/accounts')
    expect(screen.getByRole('link', { name: 'Club' })).toHaveAttribute('href', '/admin/club')
  })

  it('renders the Accounts tab at /admin/accounts and marks it current', () => {
    renderAdmin('/admin/accounts')

    expect(screen.getByText('Accounts tab marker')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Club' })).not.toHaveAttribute('aria-current')
  })

  it('switches tab client-side, without leaving the dashboard', async () => {
    const { user } = renderAdmin('/admin/accounts')

    await user.click(screen.getByRole('link', { name: 'Club' }))

    expect(await screen.findByText('U10')).toBeInTheDocument()
    expect(screen.queryByText('Accounts tab marker')).not.toBeInTheDocument()
    // Still inside the dashboard shell, not a fresh page.
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument()
  })

  // Desktop-only, the way /accounts and /overview always were. jsdom applies
  // no CSS, so the class token is what is actually testable here — the same
  // approach tests/app-shell.test.jsx uses for the role label.
  it('shows a bigger-screen note that is hidden at the desktop breakpoint', () => {
    renderAdmin()

    const note = screen.getByTestId('admin-small-screen-note')
    expect(note).toHaveTextContent(/bigger screen/i)
    expect(hasClassToken(note, 'desktop:hidden')).toBe(true)
    expect(hasClassToken(note, 'hidden')).toBe(false)
  })
})

describe('AdminClub — the Club tab', () => {
  it('lists every age group with its player count and missing-contact count', async () => {
    renderAdmin('/admin/club')

    const u10 = await screen.findByTestId('team-row-team-u10')
    // Two U10 players, one of whom (Tom) has no contact row.
    expect(u10).toHaveTextContent('2 players · 1 missing contact info')

    const u12 = screen.getByTestId('team-row-team-u12')
    // One U12 player, and he has no contact row either.
    expect(u12).toHaveTextContent('1 player · 1 missing contact info')
  })

  it('says nothing about missing contacts for a squad with none', async () => {
    listContactsForPlayersMock.mockResolvedValue([
      { player_id: 'player-zara' },
      { player_id: 'player-tom' },
      { player_id: 'player-omar' },
    ])

    renderAdmin('/admin/club')

    const u10 = await screen.findByTestId('team-row-team-u10')
    expect(u10).toHaveTextContent('2 players')
    expect(u10).not.toHaveTextContent(/missing contact/i)
  })

  it('asks for contacts for exactly the players it loaded', async () => {
    renderAdmin('/admin/club')

    await screen.findByTestId('team-row-team-u10')
    expect(listPlayersMock).toHaveBeenCalledWith()
    expect(listContactsForPlayersMock).toHaveBeenCalledWith([
      'player-zara',
      'player-tom',
      'player-omar',
    ])
  })

  // The duplication this plan removes. Asserted against the QUERY as well as
  // the DOM: an absent list that still costs a club-wide members fetch would
  // be only half the fix.
  it('does not render or fetch a club-members list', async () => {
    renderAdmin('/admin/club')

    await screen.findByTestId('team-row-team-u10')
    expect(listClubMembersMock).not.toHaveBeenCalled()
    expect(screen.queryAllByTestId('member-row')).toHaveLength(0)
  })

  it('links to the roster and schedule, client-side', async () => {
    const { user } = renderAdmin('/admin/club')

    await screen.findByTestId('team-row-team-u10')
    await user.click(screen.getByRole('link', { name: /manage roster/i }))

    expect(await screen.findByText('Roster screen marker')).toBeInTheDocument()
  })

  it('opens the invite form in a sheet', async () => {
    const { user } = renderAdmin('/admin/club')

    await screen.findByTestId('team-row-team-u10')
    await user.click(screen.getByRole('button', { name: /invite a member/i }))

    expect(await screen.findByRole('heading', { name: /invite a member/i })).toBeInTheDocument()
  })

  it('shows a loading state while the queries are in flight', () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}))

    renderAdmin('/admin/club')

    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
  })

  it('renders a failed query in an alert region, with a working retry', async () => {
    listPlayersMock.mockRejectedValue(new Error('Network unreachable'))

    const { user } = renderAdmin('/admin/club')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/network unreachable/i)

    listPlayersMock.mockResolvedValue(ALL_PLAYERS)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('team-row-team-u10')).toBeInTheDocument()
  })
})
