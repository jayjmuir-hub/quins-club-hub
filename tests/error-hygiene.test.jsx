// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Grok item 17 (30 Aug 2026): what an error is allowed to SAY to a parent.
// Two halves, one rule — server-influenced or attacker-writable text never
// reaches the DOM as copy:
//   - friendlyAuthError maps the login URL fragment (attacker-writable: any
//     link can end #error_description=...) to sentences this app wrote;
//   - friendlyMessage gates setError(err.message) so raw PostgREST/network
//     strings fall back to the screen's own copy while the hand-written
//     SECURITY DEFINER refusals still come through verbatim.

import { friendlyMessage } from '../src/lib/friendlyError.js'

const useAuthMock = vi.fn()
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/screens/Login.jsx', () => ({
  default: ({ authError }) => <div data-testid="login">{authError}</div>,
}))

import RequireAuth, { friendlyAuthError } from '../src/components/RequireAuth.jsx'

describe('friendlyMessage', () => {
  it('shows the message of an error THIS APP threw (no code)', () => {
    expect(friendlyMessage(new Error('The conversation was not deleted — you may not have the right to, or it is already gone.'), 'fallback'))
      .toMatch(/not deleted/)
  })

  it('shows a SECURITY DEFINER refusal written for the person (trusted code)', () => {
    const err = { code: 'P0001', message: "This is the club's only active admin. Make someone else an admin first." }
    expect(friendlyMessage(err, 'fallback')).toMatch(/only active admin/)
    expect(friendlyMessage({ code: '42501', message: 'You must be signed in to delete your account.' }, 'x')).toMatch(/signed in/)
  })

  it('⚠️ falls back for raw PostgREST and constraint errors', () => {
    expect(friendlyMessage({ code: 'PGRST204', message: "Could not find the 'x' column of 'y' in the schema cache" }, 'Could not do that.'))
      .toBe('Could not do that.')
    expect(friendlyMessage({ code: '23503', message: 'insert or update on table "x" violates foreign key constraint' }, 'Could not do that.'))
      .toBe('Could not do that.')
  })

  it('⚠️ network noise is never copy, whatever carried it', () => {
    expect(friendlyMessage(new TypeError('Failed to fetch'), 'Check your connection.')).toBe('Check your connection.')
  })

  it('an empty or missing message falls back', () => {
    expect(friendlyMessage(null, 'fb')).toBe('fb')
    expect(friendlyMessage({ code: '42501', message: '' }, 'fb')).toBe('fb')
  })
})

describe('friendlyAuthError', () => {
  it('maps the known GoTrue shapes to specific copy', () => {
    expect(friendlyAuthError('otp_expired', 'access_denied', 'Email link is invalid or has expired')).toMatch(/expired/)
    expect(friendlyAuthError(null, 'access_denied', 'User cancelled')).toMatch(/cancelled or refused/)
  })

  it('⚠️ never returns the attacker-typed text', () => {
    const hostile = 'YOUR ACCOUNT IS SUSPENDED — call +971-XXX and read out your password'
    const shown = friendlyAuthError(null, null, hostile)
    expect(shown).not.toContain('SUSPENDED')
    expect(shown).toMatch(/did not work/)
  })
})

describe('RequireAuth renders the mapped copy, not the fragment', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ session: null, loading: false })
    window.history.replaceState(null, '', '/')
  })

  it('an attacker-crafted #error_description lands as the generic sentence', async () => {
    window.location.hash = '#error=server_error&error_description=Visit+evil.example+to+restore+access'
    render(<RequireAuth>{null}</RequireAuth>)
    const login = await screen.findByTestId('login')
    expect(login.textContent).not.toMatch(/evil.example/)
    expect(login.textContent).toMatch(/did not work/)
  })

  it('an expired magic link explains itself', async () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    render(<RequireAuth>{null}</RequireAuth>)
    const login = await screen.findByTestId('login')
    expect(login.textContent).toMatch(/expired/)
  })
})
