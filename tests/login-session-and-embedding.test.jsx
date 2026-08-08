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
// ⚠️ EXTENDED 8 AUG 2026 with the password rebuild (see
// claude/decisions/2026-08-08-parent-self-registration.md). friendlyAuthError
// grew three password-era translations, and the whole helper is now tested
// HERE, as a pure function. It used to be exercised by rendering Login and
// clicking a button, which coupled a string-mapping test to whichever buttons
// happened to be on the screen — and duly broke every one of those tests when
// the magic-link button was hidden.
//
// Everything else about the screen is covered by tests/login.test.jsx.

const useAuthMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

import Login, { friendlyAuthError } from '../src/screens/Login.jsx'
import { SESSION_EXPIRED_KEY, markSessionExpired } from '../src/lib/sessionExpired.js'

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  // Every function the screen destructures. A missing one is a TypeError at
  // render, which reads as "the whole screen is broken" rather than as a
  // stale mock.
  useAuthMock.mockReturnValue({
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signUpWithPassword: vi.fn(),
    signInWithPassword: vi.fn(),
    sendPasswordReset: vi.fn(),
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

  it('still offers a full sign-in — email, password and a submit button', () => {
    render(<Login embedded />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('offers NO way to create an account', () => {
    // ⚠️ DELIBERATE, and the reason `embedded` forces sign-in only. The one
    // host page is /delete-account, reached by somebody on their way OUT of
    // the club. Offering them "Create account" there is absurd, and because
    // the tab strip sits above the form it would be the most prominent thing
    // on a screen a Play reviewer is specifically sent to look at.
    render(<Login embedded />)

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull()
    // ...and therefore no sign-up checklist either.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('FAULT: standalone is unchanged — the crest, heading and tab strip come back', () => {
    // The injected fault for the tests above. If `embedded` stopped being
    // read at all, they would pass here too and prove nothing.
    render(<Login />)
    expect(screen.getByRole('heading', { level: 1, name: /abu dhabi harlequins/i }))
      .toBeInTheDocument()
    expect(screen.getByAltText(/crest/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /create account/i })).toBeInTheDocument()
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
  // limit", no "429" — the rate-limit pattern does not match it.
  //
  // NOT hypothetical: 6 Aug 2026 at 04:44, in the auth logs.
  const HOOK_500 = new Error('Unexpected status code returned from hook: 500')

  it('translates it into something a parent can act on', () => {
    const out = friendlyAuthError(HOOK_500, 'fallback')
    expect(out).not.toMatch(/hook|500/i)
    // ⚠️ REPOINTED 8 AUG 2026. This used to assert the copy pointed at
    // "Continue with Google" — the escape hatch that costs no email. That
    // button is now hidden (SHOW_PASSWORDLESS), so the advice had to change,
    // and the copy is deliberately vaguer than the rate-limit copy below:
    // this same error also covers the daily cap, which does not clear in "a
    // couple of minutes", so promising that would be a lie.
    expect(out).toMatch(/try again in a few minutes/i)
    expect(out).toMatch(/contact the club/i)
  })

  it('still translates the rate limit, and still leaves everything else alone', () => {
    expect(friendlyAuthError(new Error('email rate limit exceeded'), 'x'))
      .toMatch(/lots of people are signing in/i)
    expect(friendlyAuthError(new Error('Request failed: 429 Too Many Requests'), 'x'))
      .toMatch(/wait a couple of minutes/i)
    // The allow-list stays narrow: a real, useful message passes through.
    expect(friendlyAuthError(new Error('Email address is invalid'), 'x'))
      .toBe('Email address is invalid')
  })
})

describe('friendlyAuthError — the password-era translations', () => {
  // Added 8 Aug 2026 with password auth. Three failures a parent will
  // genuinely meet, each of which GoTrue describes in a way that is either
  // useless or actively misleading.
  //
  // ⚠️ Tested as a pure function on purpose. Each case is a (code, message) ->
  // string mapping and needs no DOM; the old habit of rendering the screen to
  // check one of these is what made this logic untestable the moment the
  // buttons moved.
  //
  // Both halves of every case are covered: current supabase-js sends a stable
  // `code`, older builds send prose only. Matching on the code alone would
  // silently regress anyone on an older client, and matching on the prose
  // alone breaks the first time GoTrue rewords itself.

  describe('weak_password', () => {
    // The raw text, measured against the live signup endpoint on 8 Aug 2026,
    // enumerates all four character sets EVERY time — even when only one is
    // missing — so it can never tell a person what is actually wrong.
    const RAW =
      'Password should contain at least one character of each: ' +
      'abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()'

    it('translates the code', () => {
      const out = friendlyAuthError({ code: 'weak_password', message: RAW }, 'fallback')
      expect(out).toMatch(/meet the requirements/i)
      // Points at the live checklist, which is the thing that CAN say which
      // rule is missing.
      expect(out).toMatch(/below the password box/i)
      // The wall of character classes must not reach the parent.
      expect(out).not.toMatch(/abcdefghijklmnopqrstuvwxyz/)
    })

    it('falls back to the message when no code is sent', () => {
      expect(friendlyAuthError(new Error(RAW), 'fallback')).toMatch(/meet the requirements/i)
      // The other wording GoTrue uses when only the length rule fails.
      expect(
        friendlyAuthError(new Error('Password should be at least 8 characters'), 'fallback'),
      ).toMatch(/meet the requirements/i)
    })
  })

  describe('invalid_credentials', () => {
    // "Invalid login credentials" is accurate and unhelpful. During onboarding
    // the overwhelmingly common cause is NOT a wrong password — it is someone
    // who registered and never opened the confirmation email. Sending them off
    // to reset a password that is already correct wastes an email against the
    // cap and does not fix it.
    const RAW = 'Invalid login credentials'

    it('translates the code', () => {
      const out = friendlyAuthError({ code: 'invalid_credentials', message: RAW }, 'fallback')
      expect(out).toMatch(/just registered/i)
      expect(out).toMatch(/confirmation email/i)
      expect(out).not.toBe(RAW)
    })

    it('falls back to the message when no code is sent', () => {
      expect(friendlyAuthError(new Error(RAW), 'fallback')).toMatch(/confirmation email/i)
    })
  })

  describe('email_not_confirmed', () => {
    const RAW = 'Email not confirmed'

    it('translates the code', () => {
      const out = friendlyAuthError({ code: 'email_not_confirmed', message: RAW }, 'fallback')
      expect(out).toMatch(/open the confirmation email/i)
      // The single most common reason it "never arrived".
      expect(out).toMatch(/spam folder/i)
    })

    it('falls back to the message when no code is sent', () => {
      expect(friendlyAuthError(new Error(RAW), 'fallback')).toMatch(/spam folder/i)
    })
  })

  it('does not confuse a weak password with bad credentials', () => {
    // Both arrive from the same endpoint on the same screen. Crossing them
    // over would tell a parent to check their inbox about a password rule, or
    // to fix a password that is fine.
    const weak = friendlyAuthError({ code: 'weak_password' }, 'fallback')
    const bad = friendlyAuthError({ code: 'invalid_credentials' }, 'fallback')
    expect(weak).not.toBe(bad)
    expect(weak).not.toMatch(/confirmation email/i)
    expect(bad).not.toMatch(/below the password box/i)
  })

  it('passes an unrelated error through untouched', () => {
    // The helper is a narrow allow-list on purpose. A general error prettifier
    // would swallow messages that are more useful raw — to the user AND to
    // whoever they forward the screenshot to.
    expect(friendlyAuthError(new Error('Signups not allowed for this instance'), 'fallback'))
      .toBe('Signups not allowed for this instance')
  })

  it('falls back when the error carries no message at all', () => {
    // A rejected promise with an empty Error, or a thrown non-Error, must not
    // render an empty red banner — which reads as the app failing silently.
    expect(friendlyAuthError(new Error(''), 'Something went wrong signing in. Try again.'))
      .toBe('Something went wrong signing in. Try again.')
    expect(friendlyAuthError(undefined, 'Something went wrong. Try again.'))
      .toBe('Something went wrong. Try again.')
    expect(friendlyAuthError({}, 'Something went wrong. Try again.'))
      .toBe('Something went wrong. Try again.')
  })
})
