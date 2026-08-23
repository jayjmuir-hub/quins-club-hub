import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../src/lib/auth.jsx'

// Unit tests for src/lib/auth.jsx (Task 3: session + magic link + sign-out,
// Task 4: Google OAuth). The real @supabase/supabase-js client is never
// constructed here — src/lib/supabase.js is mocked so no network is touched.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

// signOut drops this device's push row BEFORE the session ends (23 Aug 2026,
// the shared-phone finding). Mocked here; the real thing is in push.test.js.
const unsubscribeFromPushMock = vi.fn()
vi.mock('../src/lib/push.js', () => ({
  unsubscribeFromPush: (...args) => unsubscribeFromPushMock(...args),
}))

// Import after vi.mock so this binds to the mocked module.
import { supabase } from '../src/lib/supabase.js'

// Small harness that consumes useAuth and renders its values, plus buttons
// that exercise the real functions the way the Task 5 login screen will:
// call, catch, render the error. This lets tests assert on real rendered
// output rather than only on mock call history.
function Harness() {
  const auth = useAuth()
  const [error, setError] = useState(null)

  const handle = (fn) => async () => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="session-email">{auth.session?.user?.email ?? 'none'}</div>
      <div data-testid="user-email">{auth.user?.email ?? 'none'}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <button onClick={handle(() => auth.signInWithEmail('jay@example.com'))}>
        Send magic link
      </button>
      <button onClick={handle(() => auth.signInWithGoogle())}>Sign in with Google</button>
      <button onClick={handle(() => auth.signOut())}>Sign out</button>
    </div>
  )
}

async function renderHarness() {
  render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
}

let unsubscribeMock

beforeEach(() => {
  unsubscribeMock = vi.fn()
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: unsubscribeMock } },
  })
  supabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
  supabase.auth.signOut.mockResolvedValue({ error: null })
  unsubscribeFromPushMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider / useAuth', () => {
  it('starts with loading true, then resolves to loading false with a null session', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('session-email')).toHaveTextContent('none')
    expect(screen.getByTestId('user-email')).toHaveTextContent('none')
  })

  it('exposes the session and user once getSession resolves with an existing session', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { email: 'jay@example.com' } } },
      error: null,
    })

    await renderHarness()

    expect(screen.getByTestId('session-email')).toHaveTextContent('jay@example.com')
    expect(screen.getByTestId('user-email')).toHaveTextContent('jay@example.com')
  })

  it('still resolves loading to false when getSession rejects', async () => {
    supabase.auth.getSession.mockRejectedValue(new Error('network down'))

    await renderHarness()

    expect(screen.getByTestId('session-email')).toHaveTextContent('none')
  })

  it('updates the session when onAuthStateChange fires', async () => {
    await renderHarness()

    const onChange = supabase.auth.onAuthStateChange.mock.calls[0][0]
    act(() => {
      onChange('SIGNED_IN', { user: { email: 'new@example.com' } })
    })

    expect(screen.getByTestId('session-email')).toHaveTextContent('new@example.com')
    expect(screen.getByTestId('user-email')).toHaveTextContent('new@example.com')
  })

  it('unsubscribes from onAuthStateChange when the provider unmounts', async () => {
    const { unmount } = render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    expect(unsubscribeMock).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  // These two used to assert window.location.origin. They now assert the
  // CURRENT PAGE, because sending people back to "/" broke the invite journey
  // (see the deep-link tests below and the comment in src/lib/auth.jsx).
  it('signInWithEmail calls signInWithOtp with the email and the current page as emailRedirectTo', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'jay@example.com',
      options: {
        emailRedirectTo:
          window.location.origin + window.location.pathname + window.location.search,
      },
    })
  })

  it('signInWithGoogle calls signInWithOAuth with provider google and the current page as redirectTo', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo:
          window.location.origin + window.location.pathname + window.location.search,
      },
    })
  })

  // ⚠️ THE REGRESSION GUARD. An invitee opens /accept-invite/<token> and signs
  // in from there. If the redirect drops the path they land on "/" with zero
  // memberships, are shown the REQUEST ACCESS gate, and the invite only
  // completes if they go back and tap the original link a second time.
  describe('signing in from a deep link', () => {
    const ORIGINAL_URL = window.location.href

    afterEach(() => {
      window.history.replaceState(null, '', ORIGINAL_URL)
    })

    it('returns a magic-link recipient to the page they started on, not the site root', async () => {
      window.history.replaceState(null, '', '/accept-invite/9f3c1d20-token?ref=whatsapp')
      const user = userEvent.setup()
      await renderHarness()

      await user.click(screen.getByRole('button', { name: /send magic link/i }))

      const { options } = supabase.auth.signInWithOtp.mock.calls[0][0]
      expect(options.emailRedirectTo).toBe(
        `${window.location.origin}/accept-invite/9f3c1d20-token?ref=whatsapp`,
      )
      expect(options.emailRedirectTo).not.toBe(window.location.origin)
    })

    it('returns a Google sign-in from a deep link to that same page', async () => {
      window.history.replaceState(null, '', '/accept-invite/9f3c1d20-token')
      const user = userEvent.setup()
      await renderHarness()

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      expect(supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
        `${window.location.origin}/accept-invite/9f3c1d20-token`,
      )
    })

    // The hash is where Supabase puts #access_token=... and
    // #error_description=..., so it must never be echoed back into the next
    // magic link — at best confusing, at worst a token in an email.
    it('never carries the URL fragment into the redirect', async () => {
      window.history.replaceState(null, '', '/accept-invite/tok#access_token=SECRET123')
      const user = userEvent.setup()
      await renderHarness()

      await user.click(screen.getByRole('button', { name: /send magic link/i }))

      const { options } = supabase.auth.signInWithOtp.mock.calls[0][0]
      expect(options.emailRedirectTo).toBe(`${window.location.origin}/accept-invite/tok`)
      expect(options.emailRedirectTo).not.toContain('SECRET123')
      expect(options.emailRedirectTo).not.toContain('#')
    })
  })

  it('surfaces a signInWithEmail error to the caller instead of swallowing it', async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: new Error('rate limited'),
    })
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    expect(screen.getByTestId('error')).toHaveTextContent('rate limited')
  })

  it('surfaces a signInWithGoogle error to the caller instead of swallowing it', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error('oauth misconfigured'),
    })
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    expect(screen.getByTestId('error')).toHaveTextContent('oauth misconfigured')
  })

  it('signOut calls supabase.auth.signOut', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
  })

  // ⚠️ ORDER IS THE ASSERTION. The delete needs the session that signOut ends,
  // so it must run first. A test that only checked "both were called" would
  // pass with the order reversed — and then the delete would 401 every time.
  it('drops the push subscription for this device BEFORE ending the session', async () => {
    const order = []
    unsubscribeFromPushMock.mockImplementation(async () => { order.push('unsubscribe') })
    supabase.auth.signOut.mockImplementation(async () => { order.push('signOut'); return { error: null } })
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(order).toEqual(['unsubscribe', 'signOut'])
  })

  it('still signs out when the push unsubscribe fails', async () => {
    unsubscribeFromPushMock.mockRejectedValue(new Error('no service worker'))
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('surfaces a signOut error to the caller instead of swallowing it', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: new Error('sign out failed') })
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(screen.getByTestId('error')).toHaveTextContent('sign out failed')
  })

  it('throws a clear error when useAuth is used outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    function BareHarness() {
      useAuth()
      return null
    }

    expect(() => render(<BareHarness />)).toThrow(/useAuth must be used within an AuthProvider/)

    consoleError.mockRestore()
  })
})
