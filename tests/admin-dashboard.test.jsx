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
  // The completeness card on YourPlayers reads this (17 Aug 2026).
  listPlayerPrivate: async () => [],
  // ids only, never dates — /admin/needs-attention (17 Aug 2026).
  listPlayerPrivatePresence: async () => new Set(),
  getPlayerDob: async () => null,
}))

// listClubMembers is mocked purely so the "Club tab does not list club
// members" assertion below can be made against the QUERY, not just the DOM.
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
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

const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null }]
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
    expect(screen.getByRole('link', { name: 'Squads & league teams' })).toBeInTheDocument()
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
  // ⚠️ FOUR SINCE 17 Aug 2026 — "Needs attention" joined Staff (13 Aug) in the
  // Club Hub Admin portal. The count is asserted rather than dropped: it is what
  // would catch a tab silently disappearing, and "at least two" would pass
  // against exactly that bug.
  //
  // ⚠️ THE FIXTURE HERE IS AN ORDINARY ADMIN, WHICH IS WHY "Rights log" IS NOT
  // IN THIS LIST. That tab is super-admins-only, and its own assertions live in
  // tests/admin-portals.test.jsx, both ways round. If somebody "fixes" this
  // count by adding it, they have made the audit log readable by the people it
  // audits — read src/lib/portals.js before changing the number.
  it('renders exactly four tabs — Accounts, Squads & league teams, Staff, Needs attention', () => {
    renderAdmin()

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(tabs.querySelectorAll('a')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Needs attention' })).toHaveAttribute(
      'href',
      '/admin/needs-attention',
    )
    expect(screen.queryByRole('link', { name: 'Rights log' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/admin/accounts')
    expect(screen.getByRole('link', { name: 'Squads & league teams' })).toHaveAttribute('href', '/admin/club')
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute('href', '/admin/staff')
  })

  it('renders the Accounts tab at /admin/accounts and marks it current', () => {
    renderAdmin('/admin/accounts')

    expect(screen.getByText('Accounts tab marker')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Squads & league teams' })).not.toHaveAttribute('aria-current')
  })

  it('switches tab client-side, without leaving the dashboard', async () => {
    const { user } = renderAdmin('/admin/accounts')

    await user.click(screen.getByRole('link', { name: 'Squads & league teams' }))

    expect(await screen.findByText('U10')).toBeInTheDocument()
    expect(screen.queryByText('Accounts tab marker')).not.toBeInTheDocument()
    // Still inside the dashboard shell, not a fresh page.
    // ⚠️ THE HEADING IS THE PORTAL, NOT "Admin", since 12 Aug 2026 — Accounts
    // and Club are both inside the Club Hub Admin portal, and "Admin" now names
    // the chooser at bare /admin. The claim being made here is unchanged: the
    // shell survived a client-side tab switch.
    // claude/decisions/2026-08-12-admin-portals.md
    expect(screen.getByRole('heading', { name: 'Club Hub Admin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })

  // ⚠️ INVERTED IN PHASE 4 (21 Aug 2026, Jay: "bring admin functions into
  // the app, that is my decision now"). This test used to pin the
  // "Needs a bigger screen" note and its desktop:hidden class; the note is
  // gone, and what must now hold is the opposite — the admin shell renders
  // with NO width gate wrapping it, so a phone gets the real screen.
  it('renders the admin shell with no width gate — admin works on a phone now', () => {
    renderAdmin()

    expect(screen.queryByTestId('admin-small-screen-note')).not.toBeInTheDocument()
    expect(screen.queryByText(/bigger screen/i)).not.toBeInTheDocument()
    // The tab content itself renders — the Outlet is not wrapped in any
    // width gate, so a phone gets the real screen.
    expect(screen.getByText('Accounts tab marker')).toBeInTheDocument()
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
