import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/ResetPassword.jsx, added 8 Aug 2026 with password
// auth. See claude/decisions/2026-08-08-parent-self-registration.md.
//
// ⚠️ WHY THIS SCREEN IS ODD, and what these tests are really guarding. The
// route is PUBLIC but not unauthenticated: clicking the emailed link puts a
// RECOVERY session in the URL hash, supabase-js consumes it on load, and by
// the time this renders the visitor is signed in. That is what makes
// updateUser({ password }) legal for them and nobody else — so `session` here
// is not a nicety, it IS the authorisation, and the no-session case is the one
// most worth testing.
//
// ../src/lib/auth.jsx is mocked, as in the Login tests, so nothing here can
// reach the network.

const useAuthMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

import ResetPassword from '../src/screens/ResetPassword.jsx'

const updatePassword = vi.fn()

// A password the LIVE server accepted on 8 Aug 2026 (tests/password.test.js).
const GOOD_PASSWORD = 'Harlequins1!'

/** The normal case: the link worked and left a recovery session behind. */
function withSession() {
  useAuthMock.mockReturnValue({
    session: { user: { id: 'u1', email: 'jay@example.com' } },
    loading: false,
    updatePassword,
  })
}

/** The link was reused, expired, or never carried a session at all. */
function withoutSession() {
  useAuthMock.mockReturnValue({ session: null, loading: false, updatePassword })
}

beforeEach(() => {
  vi.clearAllMocks()
  updatePassword.mockResolvedValue(undefined)
})

describe('ResetPassword — a link that no longer works', () => {
  it('says the link is spent instead of showing a form that will fail on submit', () => {
    // ⚠️ THE WHOLE POINT OF THE linkDead BRANCH. Reset links are single-use
    // and time-limited, and the worst possible outcome is a form that looks
    // perfectly fine, takes a carefully chosen password, and only then says
    // no — at which point the person cannot tell whether the app is broken,
    // their password is bad, or the link is old.
    withoutSession()
    render(<ResetPassword />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      /expired or has already been used/i,
    )
    // Announced, not just visible: this replaces the form rather than sitting
    // beside it, so a screen-reader user gets no other signal.
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('offers no password form at all in that state', () => {
    withoutSession()
    render(<ResetPassword />)

    expect(screen.queryByLabelText(/new password/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /save new password/i })).toBeNull()
    // The way out has to be visible, or the dead end is still a dead end.
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument()
  })

  it('FAULT: with a session the form is there — so the test above proves something', () => {
    withSession()
    render(<ResetPassword />)

    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ResetPassword — the form', () => {
  it('stays disabled until the password is valid AND the confirmation matches', async () => {
    // Two separate gates, and both matter. A weak password would be refused by
    // GoTrue with a message that enumerates all four character classes; a typo
    // in a password nobody can see would lock the person out of the account
    // they just recovered, with no second chance at the same link.
    const user = userEvent.setup()
    withSession()
    render(<ResetPassword />)

    const submit = screen.getByRole('button', { name: /save new password/i })
    expect(submit).toBeDisabled()

    // Valid, but nothing in the confirmation box yet.
    await user.type(screen.getByLabelText('New password'), GOOD_PASSWORD)
    expect(submit).toBeDisabled()

    // Confirmed, but the password itself fails the rules.
    await user.clear(screen.getByLabelText('New password'))
    await user.type(screen.getByLabelText('New password'), 'password')
    await user.type(screen.getByLabelText('Confirm new password'), 'password')
    expect(submit).toBeDisabled()

    // Both.
    await user.clear(screen.getByLabelText('New password'))
    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('New password'), GOOD_PASSWORD)
    await user.type(screen.getByLabelText('Confirm new password'), GOOD_PASSWORD)
    expect(submit).toBeEnabled()
  })

  it('says so, in words, when the two boxes differ', async () => {
    // A disabled button explains nothing. Both fields are masked by default,
    // so without this the person can see no difference between "I mistyped"
    // and "this screen is broken".
    const user = userEvent.setup()
    withSession()
    render(<ResetPassword />)

    await user.type(screen.getByLabelText('New password'), GOOD_PASSWORD)
    await user.type(screen.getByLabelText('Confirm new password'), 'Harlequins1?')

    expect(screen.getByText(/the two passwords don.t match/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save new password/i })).toBeDisabled()
  })

  it('shows the same five-rule checklist as sign-up', () => {
    // Same rules, same source (src/lib/password.js), same reason: GoTrue's own
    // 422 lists every character class every time and so cannot tell anyone
    // which one they are missing.
    withSession()
    render(<ResetPassword />)

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('saves the new password and confirms it changed', async () => {
    const user = userEvent.setup()
    withSession()
    render(<ResetPassword />)

    await user.type(screen.getByLabelText('New password'), GOOD_PASSWORD)
    await user.type(screen.getByLabelText('Confirm new password'), GOOD_PASSWORD)
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith(GOOD_PASSWORD))
    expect(await screen.findByText(/your password has been changed/i)).toBeInTheDocument()
    // The recovery session is a real session, so there is nothing left to do
    // but go into the app — say so rather than sending them back to sign in.
    expect(screen.getByRole('link', { name: /go to quins club hub/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  it('surfaces the RAW failure message in an announced alert', async () => {
    // ⚠️ Deliberately NOT routed through friendlyAuthError. The failures
    // reachable here are a different set — an expired recovery session, a
    // password-reuse refusal — and the sign-in screen's translations would
    // actively mislead ("check your inbox" is wrong advice here). The handful
    // of people who get this far are better served by the truth.
    const user = userEvent.setup()
    withSession()
    updatePassword.mockRejectedValue(new Error('New password should be different from the old password.'))
    render(<ResetPassword />)

    await user.type(screen.getByLabelText('New password'), GOOD_PASSWORD)
    await user.type(screen.getByLabelText('Confirm new password'), GOOD_PASSWORD)
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('New password should be different from the old password.')
    // And the form is still there, still filled in, so they can try again.
    expect(screen.getByLabelText('New password')).toHaveValue(GOOD_PASSWORD)
  })
})
