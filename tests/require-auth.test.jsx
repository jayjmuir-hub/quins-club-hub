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
  default: () => <div>Login screen stub</div>,
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

describe('RequireAuth fragment cleanup', () => {
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

  it('strips an #error_description fragment once a session is present, preserving path', () => {
    window.history.pushState({}, '', '/?error_description=denied')
    useAuthMock.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(window.location.pathname).toBe('/')
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

  it('does not touch the hash while there is no session yet', () => {
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
