import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Unit tests for src/App.jsx (Task 6: auth gate + routing). useAuth is
// mocked so this exercises App's routing/gating wiring only — not the real
// AuthProvider (tests/auth.test.jsx) or the real Login screen's own behaviour
// (tests/login.test.jsx) — and no network is ever reachable from this file.
//
// This replaces the Task 1 test that asserted on App's static placeholder
// (crest + brand name + tagline centred on the gradient). That placeholder no
// longer lives in App.jsx — App now renders routes behind RequireAuth, and
// Task 8 will replace today's route placeholders with the real app shell.
// The signed-out case below still covers the brand name/tagline, because
// RequireAuth renders the real Login screen (which carries that copy) when
// there is no session.

const useAuthMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

// Import after vi.mock so this binds to the mocked module.
import App from '../src/App.jsx'

const signedIn = { session: { user: { id: 'u1' } }, loading: false }

beforeEach(() => {
  useAuthMock.mockReset()
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

  it('renders the home placeholder at / when signed in', () => {
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /home/i })).toBeInTheDocument()
  })

  it('renders the schedule placeholder at /schedule when signed in', () => {
    window.history.pushState({}, '', '/schedule')
    useAuthMock.mockReturnValue(signedIn)

    render(<App />)

    expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument()
  })

  it('renders the roster placeholder at /roster when signed in', () => {
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

    expect(screen.getByRole('heading', { name: /home/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })
})
