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
    expect(screen.getByText(/invite-only/i)).toBeInTheDocument()
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

  it('renders the more placeholder at /more when signed in', () => {
    window.history.pushState({}, '', '/more')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /more/i })).toBeInTheDocument()
  })

  it('redirects an unknown path to / when signed in', () => {
    window.history.pushState({}, '', '/nope')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })
})
