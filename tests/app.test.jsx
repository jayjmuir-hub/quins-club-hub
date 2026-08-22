import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/App.jsx (Task 6: auth gate + routing; Task 8: shell
// composition). useAuth and useMemberships are both mocked so this exercises
// App's routing/gating/composition wiring only — not the real AuthProvider
// (tests/auth.test.jsx), the real Login screen (tests/login.test.jsx), the
// real MembershipProvider (tests/memberships.test.jsx), or AppShell's own
// loading/error/zero-membership rendering (tests/app-shell.test.jsx) — and no
// network is ever reachable from this file.
//
// This replaces the Task 1 test that asserted on App's static placeholder
// (crest + brand name + tagline centred on the gradient). That placeholder no
// longer lives in App.jsx — App now renders routes behind RequireAuth, wrapped
// in the Task 8 shell. The signed-out case below still covers the brand
// name/tagline, because RequireAuth renders the real Login screen (which
// carries that copy) when there is no session.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

// MembershipProvider is mocked to a pass-through so App's composition
// (RequireAuth -> MembershipProvider -> AppShell -> Routes) is exercised
// without touching Supabase; useMemberships is stubbed with an already-loaded
// membership so the routed placeholders are reachable through AppShell's
// loading/error/zero-membership gate (that gate's own behaviour is covered by
// tests/app-shell.test.jsx).
vi.mock('../src/lib/memberships.jsx', () => ({
  MembershipProvider: ({ children }) => children,
  useMemberships: () => useMembershipsMock(),
}))

// The /schedule route renders the real Schedule screen as of Task 11, and
// that screen queries Supabase on mount. Its data module is mocked here so
// this file stays network-free (a plan-level constraint) and keeps testing
// only App's routing. listEvents deliberately never settles: these tests
// assert synchronously straight after render, so a resolving promise would
// land its setState after the test body had finished and produce act()
// warnings for a state change no assertion here cares about. Schedule's own
// loading/loaded/error behaviour is covered by tests/schedule.test.jsx.
vi.mock('../src/data/events.js', () => ({
  listEvents: () => new Promise(() => {}),
  subscribeEvents: () => () => {},
}))

// Same treatment for the /roster route, which renders the real Roster screen
// as of Task 12, and for "/" — the real Dashboard as of Task 13, which reads
// both modules. The Dashboard's own behaviour is covered by
// tests/dashboard.test.jsx; here it only has to be the thing "/" renders.
vi.mock('../src/data/players.js', () => ({
  listPlayers: () => new Promise(() => {}),
  getPlayerContact: () => new Promise(() => {}),
  // /admin/club (AdminClub) and the Accounts tab both read players.js.
  listContactsForPlayers: () => new Promise(() => {}),

  // The completeness card on YourPlayers reads this (17 Aug 2026).
  listPlayerPrivate: async () => [],
}))

// "/more" renders the real More screen (admin-dashboard plan, 2026-08-05),
// which makes no query at all — these member mocks are here for the /admin
// routes, whose Accounts tab is the real Accounts.jsx. Those screens' own
// behaviour is covered by tests/more.test.jsx,
// tests/admin-dashboard.test.jsx and tests/accounts.test.jsx; here they only
// have to be the thing each route renders.
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  listClubMembers: () => new Promise(() => {}),
  listPendingProfiles: () => new Promise(() => {}),
  grantMemberships: () => new Promise(() => {}),
  updateMembershipRole: () => new Promise(() => {}),
  deleteMembership: () => new Promise(() => {}),
  updateProfileName: () => new Promise(() => {}),
  createInvite: () => new Promise(() => {}),
  // /accept-invite/:token (Task 18) renders the real AcceptInvite screen,
  // which calls this on mount. Never resolving keeps that test focused on
  // routing/reachability, not on AcceptInvite's own behaviour (covered by
  // tests/accept-invite.test.jsx).
  acceptInvite: () => new Promise(() => {}),
  // AppShell's NamePrompt (plan Task C) calls this on every signed-in load.
  // Never resolving keeps the prompt shut without asserting anything about
  // it here (covered by tests/name-prompt.test.jsx).
  getMyProfile: () => new Promise(() => {}),
}))

// The Accounts tab's approval gate reads these on mount.
vi.mock('../src/data/accessRequests.js', () => ({
  listAccessRequests: () => new Promise(() => {}),
  getMyAccessRequest: () => new Promise(() => {}),
  createAccessRequest: () => new Promise(() => {}),
  dismissAccessRequest: () => new Promise(() => {}),
  restoreAccessRequest: () => new Promise(() => {}),
}))

// Import after vi.mock so this binds to the mocked modules.
import App from '../src/App.jsx'

const signOutMock = vi.fn()

const signedIn = {
  session: { user: { id: 'u1' } },
  user: { id: 'u1', email: 'jay@example.com' },
  loading: false,
  signOut: signOutMock,
}
const membershipsLoaded = {
  memberships: [{ role: 'admin', status: 'active', team_id: null }],
  teams: [],
  loading: false,
  error: null,
  reload: vi.fn(),
}

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  signOutMock.mockReset()
  signOutMock.mockResolvedValue(undefined)
  useMembershipsMock.mockReturnValue(membershipsLoaded)
  window.history.pushState({}, '', '/')
})

const PARENT = {
  ...membershipsLoaded,
  memberships: [{ role: 'parent', team_id: 'team-u10', player_id: 'p1' }],
  teams: [{ id: 'team-u10', name: 'U10', sort_order: 5 }],
}
const COACH = {
  ...membershipsLoaded,
  memberships: [{ role: 'coach', team_id: 'team-u10' }],
  teams: [{ id: 'team-u10', name: 'U10', sort_order: 5 }],
}

describe('App', () => {
  it('renders the Login screen when there is no session', () => {
    useAuthMock.mockReturnValue({ session: null, loading: false })

    render(<App />)

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    // Repointed 8 Aug 2026: the intro copy changed with the password rebuild
    // (claude/decisions/2026-08-08-parent-self-registration.md). What this
    // test is about is unchanged — a signed-out visitor gets the Login screen,
    // not a blank page.
    expect(screen.getByText(/create an account to\s+get started/i)).toBeInTheDocument()
  })

  it('renders the dashboard at / when signed in', () => {
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('renders the schedule screen at /schedule when signed in', () => {
    window.history.pushState({}, '', '/schedule')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    // "Club life, *calendared.*" — the phase-5 editorial heading.
    expect(screen.getByRole('heading', { name: /club life/i })).toBeInTheDocument()
  })

  it('renders the roster screen at /roster when signed in', () => {
    window.history.pushState({}, '', '/roster')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /roster/i })).toBeInTheDocument()
  })

  it('renders the More screen at /more when signed in', () => {
    window.history.pushState({}, '', '/more')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
  })

  it('renders the More screen at /more for a non-admin too, with no not-authorised card', () => {
    window.history.pushState({}, '', '/more')
    useAuthMock.mockReturnValue(signedIn)
    useMembershipsMock.mockReturnValue(COACH)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('redirects an unknown path to / when signed in', () => {
    window.history.pushState({}, '', '/nope')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('renders /accept-invite/:token even for a brand-new invitee with zero memberships', () => {
    // The routing-gap regression this task exists to fix: AppShell only
    // renders its routed children once memberships.length > 0, which a
    // just-signed-in invitee never has yet. If this route were nested inside
    // a single shared AppShell the way the other four are, it would be
    // permanently unreachable — AppShell's NoMembershipState would render
    // instead, no matter the URL.
    window.history.pushState({}, '', '/accept-invite/tok-abc-123')
    useAuthMock.mockReturnValue(signedIn)
    useMembershipsMock.mockReturnValue({ ...membershipsLoaded, memberships: [] })

    render(<App />)

    expect(screen.getByRole('status', { name: /accepting your invite/i })).toBeInTheDocument()
    expect(screen.queryByText(/isn't linked to a squad yet/i)).not.toBeInTheDocument()
  })
})

// Routing for the back-end dashboard (admin-dashboard plan, 2026-08-05).
// These go through the REAL router and the REAL screens, which is the only
// place the redirects and the child-route mounting can be observed at all —
// tests/admin-dashboard.test.jsx stubs the Accounts tab, so this is where
// the real Accounts.jsx is proved reachable.
describe('App — /admin', () => {
  // ⚠️ THIS USED TO ASSERT A REDIRECT TO /admin/accounts, and it is rewritten
  // rather than deleted (12 Aug 2026). It is the only thing standing between a
  // future refactor and a bare /admin that renders nothing at all.
  it('renders the portal chooser at bare /admin, and does NOT redirect', () => {
    window.history.pushState({}, '', '/admin')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(window.location.pathname).toBe('/admin')
    expect(screen.getByTestId('portal-chooser')).toBeInTheDocument()
    // Club Admin is open to every admin, and entering a portal lands on its
    // FIRST tab.
    expect(screen.getByRole('link', { name: /Club Admin/ })).toHaveAttribute('href', '/admin/accounts')
  })

  it('mounts the real Accounts screen on the Accounts tab', () => {
    window.history.pushState({}, '', '/admin/accounts')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    // Accounts.jsx's own first-load spinner — a stub or a wrong mount would
    // not produce it.
    expect(screen.getByRole('status', { name: /loading accounts/i })).toBeInTheDocument()
  })

  it('mounts the Club tab at /admin/club', () => {
    window.history.pushState({}, '', '/admin/club')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('status', { name: /loading the club overview/i })).toBeInTheDocument()
  })

  // Jay has /accounts bookmarked. It must land somewhere useful, not fall
  // through the catch-all to the dashboard.
  it('redirects the old /accounts URL to /admin/accounts', () => {
    window.history.pushState({}, '', '/accounts')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(window.location.pathname).toBe('/admin/accounts')
    expect(screen.getByRole('status', { name: /loading accounts/i })).toBeInTheDocument()
  })

  it('refuses /admin for a coach', () => {
    window.history.pushState({}, '', '/admin/accounts')
    useAuthMock.mockReturnValue(signedIn)
    useMembershipsMock.mockReturnValue(COACH)

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(screen.queryByRole('link', { name: 'Club' })).not.toBeInTheDocument()
  })

  it('no longer resolves /overview', () => {
    window.history.pushState({}, '', '/overview')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
  })
})

// ⚠️ THE REGRESSION GUARD for this whole plan, end to end through the real
// App: AppShell renders the app's only sign-out control on /more and nowhere
// else, so any change that redirects /more into the admin-only /admin locks
// every parent, player and coach out of signing out. A parent is used here
// deliberately — the role with no management route to fall back on.
describe('App — a parent can still sign out', () => {
  it('signs out from /more', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/more')
    useAuthMock.mockReturnValue(signedIn)
    useMembershipsMock.mockReturnValue(PARENT)

    render(<App />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})
