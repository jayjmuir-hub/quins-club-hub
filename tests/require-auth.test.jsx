import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Unit tests for src/components/RequireAuth.jsx (Task 6). Both useAuth and
// the Login screen are mocked so this exercises only RequireAuth's own
// gating/loading/cleanup logic — not the real AuthProvider (tests/auth.test.jsx)
// or the real Login screen (tests/login.test.jsx) — and no network is ever
// reachable from this file.

const useAuthMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/screens/Login.jsx', () => ({
  default: ({ authError }) => (
    <div>
      Login screen stub
      {authError && <div data-testid="passed-auth-error">{authError}</div>}
    </div>
  ),
}))

// Import after vi.mock so this binds to the mocked modules.
import RequireAuth from '../src/components/RequireAuth.jsx'

beforeEach(() => {
  useAuthMock.mockReset()
  window.history.pushState({}, '', '/')
})

describe('RequireAuth', () => {
  it('renders a loading indicator while loading is true, not Login and not children', () => {
    useAuthMock.mockReturnValue({ session: null, loading: true })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Login screen stub')).not.toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders Login when loading is false and there is no session', () => {
    useAuthMock.mockReturnValue({ session: null, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByText('Login screen stub')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('passed-auth-error')).not.toBeInTheDocument()
  })

  it('renders children when a session is present', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.queryByText('Login screen stub')).not.toBeInTheDocument()
  })
})

describe('RequireAuth access_token cleanup (success path, needs a session)', () => {
  it('strips an #access_token fragment once a session is present, preserving path and query', () => {
    window.history.pushState({}, '', '/schedule?foo=bar#access_token=abc123&type=magiclink')
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(window.location.pathname).toBe('/schedule')
    expect(window.location.search).toBe('?foo=bar')
    expect(window.location.hash).toBe('')
  })

  it('leaves an unrelated hash alone', () => {
    window.history.pushState({}, '', '/roster#section-2')
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(window.location.pathname).toBe('/roster')
    expect(window.location.hash).toBe('#section-2')
  })
})

describe('RequireAuth auth error capture (failure path, no session ever exists)', () => {
  it('captures and decodes an error_description fragment with no session, passes it to Login, and strips the hash', () => {
    window.history.pushState(
      {},
      '',
      '/?redirect=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid%20or+has+expired',
    )
    useAuthMock.mockReturnValue({ session: null, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    // Asserts both '+' and '%20' decode to spaces (URLSearchParams handles
    // form-encoding correctly; manual decodeURIComponent would leave '+' as
    // a literal plus sign).
    expect(screen.getByTestId('passed-auth-error')).toHaveTextContent(
      'Email link is invalid or has expired',
    )
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('?redirect=1')
    expect(window.location.hash).toBe('')
  })

  it('leaves an access_token-only hash alone when there is no error and no session yet', () => {
    // This replaces a pre-fix version of this test that asserted the same
    // outcome for a different, now-incorrect reason: "nothing is ever
    // cleared without a session". That's no longer true — error fragments
    // ARE captured and cleared with no session, by design (see the describe
    // block above). This test now exists to confirm a *different* fragment
    // shape, one with no error_description at all, is correctly left alone
    // by both effects: the error-capture effect finds no error_description
    // to act on, and the access_token cleanup effect requires a session,
    // which doesn't exist yet.
    window.history.pushState({}, '', '/#access_token=abc123')
    useAuthMock.mockReturnValue({ session: null, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(window.location.hash).toBe('#access_token=abc123')
  })
})

describe('RequireAuth stale auth error cleanup (carried defect, Task 8 decision 3)', () => {
  it('clears a previously captured auth error once the session goes away, e.g. after sign-out', () => {
    window.history.pushState(
      {},
      '',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    )
    useAuthMock.mockReturnValue({ session: null, loading: false })

    const { rerender } = render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    // Sanity: the error was captured as before.
    expect(screen.getByTestId('passed-auth-error')).toBeInTheDocument()

    // The user signs in (e.g. via a fresh, successful attempt).
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
    rerender(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()

    // The user signs out from within the app: session goes away again.
    useAuthMock.mockReturnValue({ session: null, loading: false })
    rerender(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByText('Login screen stub')).toBeInTheDocument()
    expect(screen.queryByTestId('passed-auth-error')).not.toBeInTheDocument()
  })

  it('does not clear a freshly captured auth error on first mount (no prior session)', () => {
    window.history.pushState(
      {},
      '',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    )
    useAuthMock.mockReturnValue({ session: null, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByTestId('passed-auth-error')).toBeInTheDocument()
  })
})
