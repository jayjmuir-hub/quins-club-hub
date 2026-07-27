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

  it('signInWithEmail calls signInWithOtp with the email and the app origin as emailRedirectTo', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'jay@example.com',
      options: { emailRedirectTo: window.location.origin },
    })
  })

  it('signInWithGoogle calls signInWithOAuth with provider google and the app origin as redirectTo', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
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
