import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The three Login changes of 6 Aug 2026, third session:
//
//   1. `embedded` — render as a plain card inside /delete-account, which is
//      public and has to offer sign-in itself.
//   2. The session-expired explanation, so the session guard stops throwing
//      people to a login screen with no reason given.
//   3. friendlyAuthError learning the mail-hook 500, which is what hitting
//      Resend's 100/day cap actually looks like to a parent.
//
// Existing Login behaviour is covered by tests/login.test.jsx; this file only
// guards the new parts.

const useAuthMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

import Login, { friendlyAuthError } from '../src/screens/Login.jsx'
import { SESSION_EXPIRED_KEY, markSessionExpired } from '../src/lib/sessionExpired.js'

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  useAuthMock.mockReturnValue({
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
  })
})

describe('Login — embedded', () => {
  it('drops the club heading, so the host page owns the only <h1>', () => {
    render(<Login embedded />)

    // ⚠️ Two <h1>s on one page is wrong for anyone navigating by heading.
    // /delete-account already provides it.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByAltText(/crest/i)).toBeNull()
  })

  it('still offers both ways to sign in', () => {
    render(<Login embedded />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /email me a link/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('FAULT: standalone is unchanged — the crest and heading come back', () => {
    // The injected fault for the test above. If `embedded` stopped being
    // read at all, that test would pass here too and prove nothing.
    render(<Login />)
    expect(screen.getByRole('heading', { level: 1, name: /abu dhabi harlequins/i }))
      .toBeInTheDocument()
    expect(screen.getByAltText(/crest/i)).toBeInTheDocument()
  })
})

describe('Login — session expired', () => {
  it('says why, when the guard left a note', () => {
    markSessionExpired()
    render(<Login />)

    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i)
  })

  it('says nothing when there is no note — an ordinary sign-out is not a fault', () => {
    render(<Login />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the note, so it cannot haunt the next render', () => {
    markSessionExpired()
    const { unmount } = render(<Login />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull()

    unmount()
    render(<Login />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('friendlyAuthError — the mail-hook 500', () => {
  // ⚠️ THE REAL STRING. GoTrue returns this verbatim when Resend refuses,
  // which is what hitting the 100/day cap looks like. It contains no "rate
  // limit", no "429" — the existing pattern does not match it.
  const HOOK_500 = new Error('Unexpected status code returned from hook: 500')

  it('translates it into something a parent can act on', () => {
    const out = friendlyAuthError(HOOK_500, 'fallback')
    expect(out).not.toMatch(/hook|500/i)
    expect(out).toMatch(/continue with google/i)
  })

  it('still translates the rate limit, and still leaves everything else alone', () => {
    expect(friendlyAuthError(new Error('email rate limit exceeded'), 'x'))
      .toMatch(/lots of people are signing in/i)
    // The allow-list stays narrow: a real, useful message passes through.
    expect(friendlyAuthError(new Error('Email address is invalid'), 'x'))
      .toBe('Email address is invalid')
  })
})
