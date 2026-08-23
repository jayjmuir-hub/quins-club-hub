import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Account deletion — the in-app screen, the public routes, and the data call.
//
// Google Play requires BOTH an in-app deletion path and a public web link.
// This app satisfies both with one screen, so the two things worth guarding
// are (a) that the screen is genuinely reachable WITHOUT a session, and
// (b) that a destructive action cannot fire by accident.
//
// The database half — what is deleted, what is kept, and the last-admin
// refusal — is proved directly against Postgres with rolled-back fault
// injections; see claude/decisions/2026-08-06-account-deletion.md. These tests
// do not re-prove it and must not pretend to.

const useAuthMock = vi.fn()
const deleteMyAccountMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../src/data/account.js', async () => {
  const actual = await vi.importActual('../src/data/account.js')
  return {
    ...actual,
    deleteMyAccount: (...args) => deleteMyAccountMock(...args),
  }
})

import DeleteAccount from '../src/screens/DeleteAccount.jsx'
import Privacy from '../src/screens/Privacy.jsx'
import { MemoryRouter } from 'react-router-dom'

const SIGNED_IN = { user: { id: 'u1', email: 'parent@example.com' }, session: {} }
const SIGNED_OUT = { user: null, session: null }

function renderScreen(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({
    ...SIGNED_OUT,
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
  deleteMyAccountMock.mockResolvedValue(undefined)
})

describe('/delete-account — signed out', () => {
  it('renders for someone with NO session, and offers sign-in in place', async () => {
    // ⚠️ THE LOAD-BEARING ONE. A Play reviewer opens this URL cold, with no
    // account. Before 6 Aug 2026 every route sat inside RequireAuth and this
    // was impossible.
    renderScreen(<DeleteAccount />)

    expect(
      screen.getByRole('heading', { name: /delete your quins club hub account/i }),
    ).toBeInTheDocument()
    // The real Login screen, rendered in place — not a link to it, because a
    // link would send them somewhere that forgets why they came.
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    // Repointed 8 Aug 2026: the Google button is mothballed behind
    // SHOW_PASSWORDLESS, so sign-in here is email + password. Unchanged
    // intent — a usable sign-in, in place, on this page.
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    // ...and NOT an invitation to join, on the page someone uses to leave.
    // See claude/decisions/2026-08-08-parent-self-registration.md.
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull()
  })

  it('offers no delete control at all without a session', () => {
    renderScreen(<DeleteAccount />)
    expect(screen.queryByRole('button', { name: /delete my account/i })).toBeNull()
  })

  it('explains what survives, so nobody deletes their child by accident', () => {
    renderScreen(<DeleteAccount />)
    expect(screen.getByText(/your child stays on their squad/i)).toBeInTheDocument()
    // The surprise is disclosed rather than hidden — see the decision doc.
    expect(screen.getByText(/signing in again later will set your account up again/i))
      .toBeInTheDocument()
  })
})

describe('/delete-account — signed in', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      ...SIGNED_IN,
      signInWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
  })

  it('names the account being deleted', () => {
    renderScreen(<DeleteAccount />)
    expect(screen.getByText('parent@example.com')).toBeInTheDocument()
  })

  it('FAULT: the button does nothing until the confirm word is typed', async () => {
    const user = userEvent.setup()
    renderScreen(<DeleteAccount />)

    const button = screen.getByRole('button', { name: /delete my account/i })
    expect(button).toBeDisabled()

    // Inject the fault a real person would: type something that is NOT the
    // confirm word and press the button anyway.
    await user.type(screen.getByLabelText(/type delete to confirm/i), 'delete my account')
    expect(button).toBeDisabled()
    await user.click(button)

    expect(deleteMyAccountMock).not.toHaveBeenCalled()
  })

  it('deletes once the word is typed, and says so plainly afterwards', async () => {
    const user = userEvent.setup()
    renderScreen(<DeleteAccount />)

    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE')
    await user.click(screen.getByRole('button', { name: /delete my account/i }))

    await waitFor(() => expect(deleteMyAccountMock).toHaveBeenCalledTimes(1))
    // No arguments, ever. The database deletes auth.uid() and takes no id, so
    // passing one here would be a lie about what the call can do.
    expect(deleteMyAccountMock).toHaveBeenCalledWith()

    expect(await screen.findByText(/your account has been deleted/i)).toBeInTheDocument()
    // Not bounced to a login screen: that reads as failure to someone who
    // just asked to leave.
    expect(screen.queryByRole('button', { name: /delete my account/i })).toBeNull()
  })

  it('accepts the confirm word in any case — phone keyboards fight all-caps', async () => {
    const user = userEvent.setup()
    renderScreen(<DeleteAccount />)

    await user.type(screen.getByLabelText(/type delete to confirm/i), 'delete')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete my account/i })).toBeEnabled(),
    )
  })

  it('shows a refusal without pretending the account is gone', async () => {
    const user = userEvent.setup()
    deleteMyAccountMock.mockRejectedValue(
      new Error('You are the only admin, so you cannot delete your account yet.'),
    )
    renderScreen(<DeleteAccount />)

    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE')
    await user.click(screen.getByRole('button', { name: /delete my account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/only admin/i)
    // ⚠️ The whole point: a failed deletion must NOT look like a successful one.
    expect(screen.queryByText(/your account has been deleted/i)).toBeNull()
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument()
  })
})

describe('/privacy', () => {
  it('renders with no session, and states the facts that were verified', () => {
    renderScreen(<Privacy />)

    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument()
    // Each of these was checked against the live system. If someone changes
    // what the app does without changing the policy, this fails.
    // The region was named until 23 Aug 2026; Jay asked for "secure providers".
    expect(screen.queryByText(/tokyo/i)).toBeNull()
    expect(screen.getByText(/secure, reputable hosting and email providers/i)).toBeInTheDocument()
    expect(
      screen.getByText(/do not sell it, share it outside the club, advertise, or track you/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/a child does not sign in/i)).toBeInTheDocument()
  })

  it('describes squad visibility truthfully, not as "own children only"', () => {
    // ⚠️ THIS WAS WRONG AND LIVE. The policy said "A parent sees only their
    // own children". The RLS policies say otherwise: `players`, `events` and
    // `availability` are readable by anyone holding a membership row for that
    // squad, so a U15 parent sees all 53 children's names, photos and
    // availability. Only player_contacts and player_parents are restricted to
    // is_own_player.
    //
    // The sharing is deliberate — it is what a team sheet is. The policy
    // describing the opposite is the problem, because that is the document a
    // parent would point at if they objected.
    renderScreen(<Privacy />)

    expect(screen.queryByText(/a parent sees only their own children/i)).toBeNull()
    expect(screen.getByText(/names, photographs and availability of the rest/i)).toBeInTheDocument()
    // The half that IS restricted must still be stated plainly.
    expect(
      screen.getByText(/contact details for a child are visible to that child.s family and to the squad.s coaches and managers/i),
    ).toBeInTheDocument()
  })

  it('links to the deletion route, because the policy promises it', () => {
    renderScreen(<Privacy />)
    const links = screen.getAllByRole('link', { name: /delete/i })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/delete-account'))
  })
})
