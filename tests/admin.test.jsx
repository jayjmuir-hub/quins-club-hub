import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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
const useAuthMock = vi.fn()
const listPlayersMock = vi.fn()
const listClubMembersMock = vi.fn()
const createInviteMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Admin renders InviteForm (Task 18) in a Sheet; InviteForm itself reads
// useAuth for the inviting admin's id and calls createInvite. Its own
// behaviour is covered by tests/invite-form.test.jsx — here it only matters
// that Admin's "Invite a member" button actually opens it.
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

vi.mock('../src/data/members.js', () => ({
  listClubMembers: (...args) => listClubMembersMock(...args),
  createInvite: (...args) => createInviteMock(...args),
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
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
  listPlayersMock.mockResolvedValue(ALL_PLAYERS)
  listClubMembersMock.mockResolvedValue(MEMBER_ROWS)
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Admin />, { wrapper: RouterOnly })
  return { user, ...utils }
}

// react-router-dom's <Link> renders an <a href> under the hood, but only
// works (and only stays a client-side navigation) inside a Router. Admin no
// longer renders plain <a href> for its Manage entry points, so every test
// here needs a Router in the tree even when it doesn't care about routing —
// hence this bare wrapper for setup().
function RouterOnly({ children }) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {children}
    </MemoryRouter>
  )
}

// Renders Admin plus real <Route>s for /roster and /schedule in one
// MemoryRouter/Routes tree, exactly the standard RTL pattern for proving an
// element is a genuine <Link> wired to the router rather than a plain <a
// href>: jsdom can't observe a hard vs soft navigation directly (a hard nav
// would tear down the whole JS realm, which jsdom doesn't model), but it can
// observe whether clicking swaps the rendered content *within the same
// render tree* without a fresh render() call — which is only possible via
// the router's history API, i.e. only via <Link>/<NavLink>. A plain <a
// href="/roster"> inside this same tree would not be intercepted by
// react-router at all and this test would fail to find the target markers
// after the click, since jsdom does not follow anchor navigations.
function renderAdminWithRoutes() {
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={['/more']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/more" element={<Admin />} />
        <Route path="/roster" element={<div>Roster screen marker</div>} />
        <Route path="/schedule" element={<div>Schedule screen marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
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
    // A <Link> still renders as an <a href="...">, so these attribute
    // assertions hold both before and after the D1 fix — they alone would
    // not have caught a plain <a href> regression. The two tests below
    // (client-side navigation) are what actually pin the fix down.
    expect(screen.getByRole('link', { name: /manage roster/i })).toHaveAttribute('href', '/roster')
    expect(screen.getByRole('link', { name: /manage schedule/i })).toHaveAttribute('href', '/schedule')
  })

  // Regression test for Defect D1 (Task 17 visual verification): both
  // "Manage" entry points were plain <a href> tags, which a real Chromium
  // click proved caused a full hard page reload instead of an SPA route
  // change. jsdom never actually follows an <a href> to a new document, so
  // a plain-<a> version of Admin would render this test's target route as
  // unreachable within the same tree — no navigation event fires, and the
  // marker text is never found — while the fixed <Link> version does
  // navigate within the tree. This is the meaningful jsdom-level proxy for
  // "genuinely wired to the router" per RTL's documented Link-testing
  // pattern; the real hard-vs-soft-nav distinction was independently
  // confirmed by the browser-based visual verification pass, not by this
  // unit test.
  it('navigates to the roster route client-side when "Manage roster & players" is clicked', async () => {
    const { user } = renderAdminWithRoutes()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByRole('link', { name: /manage roster/i }))

    expect(await screen.findByText('Roster screen marker')).toBeInTheDocument()
  })

  it('navigates to the schedule route client-side when "Manage schedule & fixtures" is clicked', async () => {
    const { user } = renderAdminWithRoutes()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByRole('link', { name: /manage schedule/i }))

    expect(await screen.findByText('Schedule screen marker')).toBeInTheDocument()
  })

  it('does not use jersey numbers on club member rows', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.queryByText(/jersey/i)).not.toBeInTheDocument()
  })
})

describe('Admin — invite entry point (Task 18)', () => {
  it('offers a real, functional "Invite a member" button', async () => {
    setup()

    await screen.findByText('Sara Coach')
    expect(screen.getByRole('button', { name: /invite a member/i })).toBeInTheDocument()
  })

  it('opens InviteForm in a sheet when clicked', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByRole('button', { name: /invite a member/i }))

    expect(await screen.findByRole('heading', { name: /invite a member/i })).toBeInTheDocument()
  })

  it('closes the sheet without touching the club-wide member list', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByRole('button', { name: /invite a member/i }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Sending an invite creates an `invites` row, not a `memberships` row —
    // nothing changes in the club-members list until the invite is
    // accepted, so closing the sheet must not re-query it.
    expect(listClubMembersMock).toHaveBeenCalledTimes(1)
  })
})
