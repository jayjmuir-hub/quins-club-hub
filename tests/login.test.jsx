import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Login.jsx. ../src/lib/auth.jsx is mocked so this
// screen's test exercises only the screen's own behaviour — not the real
// AuthProvider (that's covered by tests/auth.test.jsx) — and so no network
// call is ever reachable from this file.
//
// ⚠️ REBUILT 8 AUG 2026 alongside the screen itself. See
// claude/decisions/2026-08-08-parent-self-registration.md: parents now create
// their own account with an email and a password instead of being matched
// against a pre-seeded roster, so the magic-link-shaped tests that used to
// live here were testing a screen that no longer exists.
//
// TWO THINGS MOVED RATHER THAN DIED:
//   * friendlyAuthError is now tested as a pure function in
//     tests/login-session-and-embedding.test.jsx. Several tests in this file
//     used to render the whole screen and click a button purely to assert a
//     string mapping — which is exactly why they all broke the moment the
//     button they clicked was hidden. A pure function deserves a pure test.
//   * The magic-link and Google journeys are not deleted, they are asserted
//     ABSENT (see the last test in the first block). SHOW_PASSWORDLESS is
//     false; the code behind it still works.

const signInWithEmail = vi.fn()
const signInWithGoogle = vi.fn()
const signUpWithPassword = vi.fn()
const signInWithPassword = vi.fn()
const sendPasswordReset = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signInWithEmail,
    signInWithGoogle,
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
    updatePassword: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// Import after vi.mock so this binds to the mocked module.
import Login from '../src/screens/Login.jsx'

// A password the LIVE server accepted on 8 Aug 2026 (see tests/password.test.js).
// Used everywhere a sign-up has to get past the client-side checklist.
const GOOD_PASSWORD = 'Harlequins1!'

beforeEach(() => {
  signInWithEmail.mockReset()
  signInWithGoogle.mockReset()
  signUpWithPassword.mockReset()
  signInWithPassword.mockReset()
  sendPasswordReset.mockReset()
  // Sign-up resolves with a SHAPE, not undefined: the screen destructures
  // `{ alreadyRegistered }` off the result, so a bare mockResolvedValue()
  // would throw a TypeError that surfaces as a generic error banner and make
  // an unrelated test look like a copy failure.
  signUpWithPassword.mockResolvedValue({ alreadyRegistered: false, session: null })
})

/** The tab strip is role="tablist"; switching modes is a real user action. */
async function switchToSignUp(user) {
  await user.click(screen.getByRole('tab', { name: /create account/i }))
}

describe('Login screen', () => {
  it('has an accessible email field and an accessible password field', () => {
    render(<Login />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('names the app and says who it is for, without claiming to be invite-only', () => {
    render(<Login />)

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    // Deliberately NOT "invite-only ... ask your club admin" any more: since
    // 8 Aug 2026 a parent creates their own account and waits for approval,
    // so the intro has to invite them to do that rather than to go away.
    expect(screen.getByText(/create an account to\s+get started/i)).toBeInTheDocument()
    expect(screen.queryByText(/invite-only/i)).toBeNull()
  })

  it('renders the crest with a meaningful alt and without a cropping object-fit class', () => {
    // Regression: crest.png is 369x400 (portrait) inside a square box.
    // object-cover (or the default object-fit:fill with no override) either
    // crops or visually flattens the shield's pointed base — see Task 8
    // review. object-contain preserves the native aspect ratio instead.
    render(<Login />)

    const crestImg = screen.getByRole('img', { name: /crest/i })
    expect(crestImg).toHaveAttribute('alt', expect.not.stringMatching(/^$/))
    const classes = crestImg.className.split(/\s+/)
    expect(classes).toContain('object-contain')
    expect(classes).not.toContain('object-cover')
  })

  it('does not offer the magic-link or Google buttons while they are mothballed', () => {
    // ⚠️ THIS IS THE POINT OF SHOW_PASSWORDLESS, not an accident. Jay's
    // ruling, 8 Aug 2026: hide both routes, keep the code. If someone flips
    // that constant back to true this test fails, which is the correct and
    // deliberate signal — update it in the same commit rather than deleting
    // it, so the next person can still tell which state we are in.
    //
    // ⚠️ It is NOT a security assertion. Supabase cannot disable email
    // sign-in, so an account with an email identity can still get a magic
    // link via the API. This only says the screen does not offer one.
    render(<Login />)

    expect(screen.queryByRole('button', { name: /email me a link/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull()
    expect(signInWithEmail).not.toHaveBeenCalled()
    expect(signInWithGoogle).not.toHaveBeenCalled()
  })
})

describe('Login screen — signing in', () => {
  it('sends the typed email and password to signInWithPassword', async () => {
    signInWithPassword.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever-they-have')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith('jay@example.com', 'whatever-they-have'),
    )
  })

  it('does not call signInWithPassword for an empty or invalid email', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(signInWithPassword).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('never blocks submit on the sign-in tab for a password that fails our rules', async () => {
    // ⚠️ DELIBERATE ASYMMETRY, not an oversight. See
    // claude/decisions/2026-08-08-parent-self-registration.md: the checklist
    // exists to stop a NEW password meeting a 422. An EXISTING password that
    // predates a rule change is still the right password, and refusing to
    // submit it would lock that person out with no explanation and no route
    // to a fix. Only the server may reject a sign-in.
    signInWithPassword.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.type(screen.getByLabelText('Password'), 'abc')

    const submit = screen.getByRole('button', { name: /^sign in$/i })
    expect(submit).toBeEnabled()

    await user.click(submit)
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith('jay@example.com', 'abc'),
    )
  })

  it('shows no password checklist on the sign-in tab', () => {
    // The checklist is advice for someone CHOOSING a password. Shown next to
    // an existing one it reads as an accusation that the password they have
    // been using for months is wrong.
    render(<Login />)

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('renders a visible, announced error when signInWithPassword throws', async () => {
    // ⚠️ THIRD REPOINTED ANCHOR (8 Aug 2026), same cause as the two in the
    // authError block below. This test is about an error REACHING the user in
    // an announced role="alert" region — not about any particular wording —
    // so it is deliberately pointed at a message friendlyAuthError passes
    // through untouched. Point it at anything on the allow-list and it starts
    // passing or failing for reasons unrelated to what it is about.
    signInWithPassword.mockRejectedValue(new Error('Email address is invalid'))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email address is invalid')
  })

  it('disables the submit button while the request is in flight', async () => {
    // Double-submitting a sign-in is cheap; double-submitting a sign-up costs
    // a second confirmation email against a 100/day Resend cap.
    let resolveSignIn
    signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve
      }),
    )
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    const submit = screen.getByRole('button', { name: /^sign in$/i })
    await user.click(submit)

    expect(submit).toBeDisabled()

    resolveSignIn()
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1))
  })
})

describe('Login screen — creating an account', () => {
  it('sends the typed email and password to signUpWithPassword', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await switchToSignUp(user)
    await user.type(screen.getByLabelText(/email address/i), 'newparent@example.com')
    await user.type(screen.getByLabelText('Password'), GOOD_PASSWORD)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(signUpWithPassword).toHaveBeenCalledWith('newparent@example.com', GOOD_PASSWORD),
    )
  })

  it('keeps submit disabled until the password passes the rules', async () => {
    // The client rules mirror the Supabase dashboard (src/lib/password.js).
    // Gating the button here means the normal case never meets GoTrue's 422,
    // whose message enumerates all four character classes every time and so
    // cannot tell a parent what is actually missing.
    const user = userEvent.setup()
    render(<Login />)

    await switchToSignUp(user)
    await user.type(screen.getByLabelText(/email address/i), 'newparent@example.com')

    const submit = screen.getByRole('button', { name: /create account/i })
    expect(submit).toBeDisabled()

    // 'Password1' is the near-miss: everything but a symbol. The server
    // returned 422 weak_password for it on 8 Aug 2026.
    await user.type(screen.getByLabelText('Password'), 'Password1')
    expect(submit).toBeDisabled()

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), GOOD_PASSWORD)
    expect(submit).toBeEnabled()
  })

  it('shows the full five-rule checklist so a parent can see WHICH rule is missing', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await switchToSignUp(user)

    // Five, not "some": a partial list is how the checklist quietly drifts
    // out of sync with the dashboard and a parent goes all-green into a 422.
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('clears the password field when the tab changes', async () => {
    // Deliberate, in switchMode(). Someone who typed a password into "sign
    // in", failed, and switched to "create account" should be making a fresh
    // decision — not silently registering with a guess at somebody's password.
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText('Password'), 'a-guess-at-my-old-one')
    expect(screen.getByLabelText('Password')).toHaveValue('a-guess-at-my-old-one')

    await switchToSignUp(user)
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('shows a "Check your email" panel naming the address after a successful sign-up', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await switchToSignUp(user)
    await user.type(screen.getByLabelText(/email address/i), 'newparent@example.com')
    await user.type(screen.getByLabelText('Password'), GOOD_PASSWORD)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    const panel = (await screen.findByRole('heading', { name: /check your email/i }))
      .parentElement
    expect(within(panel).getByText('newparent@example.com')).toBeInTheDocument()
    expect(panel).toHaveTextContent(/open it to activate your account/i)

    // ⚠️ MUST NOT ASSERT THAT AN EMAIL WAS SENT. Added 8 Aug 2026 after this
    // panel opened with "We've sent a confirmation link to X" and the caveat
    // came second. Jay read the first line, waited for an email that a repeat
    // signup never produces, and reported a fault. The copy has to hold both
    // outcomes because the app cannot tell which one happened.
    expect(panel.textContent).not.toMatch(/we[’']ve sent a confirmation link to/i)
    expect(panel).toHaveTextContent(/if .* is new/i)

    // Both ways out, equally weighted — the app does not know which applies.
    expect(within(panel).getByRole('button', { name: /back to sign in/i })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /reset my password/i })).toBeInTheDocument()
  })

  it('says exactly the same thing when the email is ALREADY registered', async () => {
    // ⚠️ ANTI-ENUMERATION, AND THE MOST DELIBERATE DECISION ON THIS SCREEN.
    // See claude/decisions/2026-08-08-parent-self-registration.md.
    //
    // GoTrue answers a signup for an existing address with 200 and an
    // obfuscated user (empty `identities`), and sends nothing. auth.jsx turns
    // that into `{ alreadyRegistered: true }` so the decision is VISIBLE
    // rather than accidental — but the screen must not branch on it. Saying
    // "that email is already taken" confirms to anyone who cares to ask that
    // a named family are members of this club, and this app's whole roster is
    // children.
    //
    // The route out for the person who genuinely forgot is the "already had
    // an account?" line in the panel, which costs no information.
    const user = userEvent.setup()

    async function signUpAndReadPanel() {
      const view = render(<Login />)
      await switchToSignUp(user)
      await user.type(screen.getByLabelText(/email address/i), 'known@example.com')
      await user.type(screen.getByLabelText('Password'), GOOD_PASSWORD)
      await user.click(screen.getByRole('button', { name: /create account/i }))
      const panel = (await screen.findByRole('heading', { name: /check your email/i }))
        .parentElement
      const text = panel.textContent
      view.unmount()
      return text
    }

    signUpWithPassword.mockResolvedValue({ alreadyRegistered: false, session: null })
    const fresh = await signUpAndReadPanel()

    signUpWithPassword.mockResolvedValue({ alreadyRegistered: true, session: null })
    const existing = await signUpAndReadPanel()

    expect(existing).toBe(fresh)
    // And spell out the two words that must never appear, so a future
    // "helpful" copy edit fails here rather than in front of the club.
    expect(existing).not.toMatch(/already (taken|registered|exists|in use)/i)
    // The honest, non-leaking way to help the person who forgot.
    expect(existing).toMatch(/nothing will arrive/i)
  })
})

describe('Login screen — forgot password', () => {
  it('sends the typed email to sendPasswordReset', async () => {
    sendPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a reset link/i }))

    await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith('jay@example.com'))
  })

  it('asks for no password at all — there is nothing to type yet', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /forgot password/i }))

    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('confirms CONDITIONALLY — "if there is an account for…" — never that there is one', async () => {
    // ⚠️ ANTI-ENUMERATION AGAIN, same reasoning as the sign-up panel above and
    // the same decision doc. "We've sent you a reset link" is a statement that
    // the address has an account here; "if there's an account for…" is not,
    // and reads no worse to the person who does have one.
    sendPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email address/i), 'maybe@example.com')
    await user.click(screen.getByRole('button', { name: /email me a reset link/i }))

    const panel = (await screen.findByRole('heading', { name: /check your email/i }))
      .parentElement
    // Apostrophe-insensitive: the copy uses a typographic ’ and a straight-
    // quote assertion would fail for a reason that has nothing to do with the
    // decision being guarded.
    expect(panel).toHaveTextContent(/if there.s an account for/i)
    expect(panel).toHaveTextContent(/maybe@example\.com/)
    // The unconditional phrasing must not creep back in.
    expect(panel.textContent).not.toMatch(/we.ve sent you a link/i)
  })

  it('lets the user get back to the form from the confirmation panel', async () => {
    sendPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a reset link/i }))
    await screen.findByRole('heading', { name: /check your email/i })

    await user.click(screen.getByRole('button', { name: /back to sign in/i }))

    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /check your email/i })).toBeNull()
  })
})

describe('Login screen authError prop', () => {
  // authError is what RequireAuth passes in when the visitor arrived via a
  // failed magic-link/OAuth redirect (e.g. an expired link). It shares the
  // same alert region as the screen's own errors rather than a second one.
  //
  // ⚠️ STILL LIVE despite SHOW_PASSWORDLESS being false. Password reset and
  // email confirmation are both redirect links, and both can expire.

  it('renders a passed-in authError in the alert region, prefixed for clarity', () => {
    render(<Login authError="Email link is invalid or has expired" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("That sign-in link didn't work")
    expect(alert).toHaveTextContent('Email link is invalid or has expired')
  })

  it('does not render an alert when there is no authError and no local error', () => {
    render(<Login />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the passed-in authError once the user starts a fresh attempt', async () => {
    sendPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login authError="Email link is invalid or has expired" />)

    expect(screen.getByRole('alert')).toHaveTextContent("didn't work")

    // Repointed from the magic-link button (hidden since 8 Aug 2026) to the
    // reset flow. The intent is unchanged: a stale banner about the last
    // journey must not sit on top of the new one.
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a reset link/i }))

    await screen.findByRole('heading', { name: /check your email/i })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the passed-in authError the moment the user switches tabs', async () => {
    // switchMode() calls clearBanners(). Replaces the old "retries with
    // Google" test, whose button is gone; the thing being guarded — a stale
    // banner does not follow you around the screen — is the same.
    const user = userEvent.setup()
    render(<Login authError="Email link is invalid or has expired" />)

    expect(screen.getByRole('alert')).toHaveTextContent("didn't work")

    await switchToSignUp(user)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not resurrect the passed-in authError alongside a fresh error from a failed retry', async () => {
    // ⚠️ ANCHOR REPOINTED, NOT DELETED (6 Aug 2026, again 8 Aug). This used to
    // reject with `new Error('rate limited')`, chosen as an arbitrary error
    // string. It stopped being arbitrary the moment friendlyAuthError() began
    // translating anything matching /rate limit/i — the test would then pass
    // or fail for a reason unrelated to what it is actually about, which is
    // that a FRESH error REPLACES the stale authError. Repointed at an error
    // the helper passes through untouched.
    signInWithPassword.mockRejectedValue(new Error('Email address is invalid'))
    const user = userEvent.setup()
    render(<Login authError="Email link is invalid or has expired" />)

    await user.type(screen.getByLabelText(/email address/i), 'jay@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email address is invalid')
    expect(alert).not.toHaveTextContent("didn't work")
  })
})
