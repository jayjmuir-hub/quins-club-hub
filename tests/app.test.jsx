import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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
}))

// Same treatment for "/more", which renders the real Admin screen as of
// Task 17. The Admin screen's own behaviour (the not-authorised gate,
// loading/empty/error, teams/players/members) is covered by
// tests/admin.test.jsx; here it only has to be the thing "/more" renders.
vi.mock('../src/data/members.js', () => ({
  listClubMembers: () => new Promise(() => {}),
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

// Import after vi.mock so this binds to the mocked modules.
import App from '../src/App.jsx'

const signedIn = {
  session: { user: { id: 'u1' } },
  user: { id: 'u1', email: 'jay@example.com' },
  loading: false,
  signOut: vi.fn(),
}
const membershipsLoaded = {
  memberships: [{ role: 'admin', team_id: null }],
  teams: [],
  loading: false,
  error: null,
  reload: vi.fn(),
}

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  useMembershipsMock.mockReturnValue(membershipsLoaded)
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('renders the Login screen when there is no session', () => {
    useAuthMock.mockReturnValue({ session: null, loading: false })

    render(<App />)

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    expect(screen.getByText(/ask them to on the next screen/i)).toBeInTheDocument()
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

    expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument()
  })

  it('renders the roster screen at /roster when signed in', () => {
    window.history.pushState({}, '', '/roster')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /roster/i })).toBeInTheDocument()
  })

  it('renders the admin screen at /more when signed in as an admin', () => {
    window.history.pushState({}, '', '/more')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /admin overview/i })).toBeInTheDocument()
  })

  it('renders a not-authorised message at /more for a non-admin', () => {
    window.history.pushState({}, '', '/more')
    useAuthMock.mockReturnValue(signedIn)
    useMembershipsMock.mockReturnValue({
      ...membershipsLoaded,
      memberships: [{ role: 'coach', team_id: 'team-u10' }],
    })

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
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
