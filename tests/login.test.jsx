import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Login.jsx (Task 5). ../src/lib/auth.jsx is
// mocked so this screen's test exercises only the screen's own behaviour —
// not the real AuthProvider (that's covered by tests/auth.test.jsx) — and so
// no network call is ever reachable from this file.

const signInWithEmail = vi.fn()
const signInWithGoogle = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signInWithEmail,
    signInWithGoogle,
    signOut: vi.fn(),
  }),
}))

// Import after vi.mock so this binds to the mocked module.
import Login from '../src/screens/Login.jsx'

beforeEach(() => {
  signInWithEmail.mockReset()
  signInWithGoogle.mockReset()
})

describe('Login screen', () => {
  it('has an accessible email field', () => {
    render(<Login />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('names the app and points at the request flow rather than a dead end', () => {
    render(<Login />)

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    // Deliberately NOT "invite-only ... ask your club admin" any more: an
    // account with no membership can now ask for access from inside the app.
    expect(screen.getByText(/ask them to on the next screen/i)).toBeInTheDocument()
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

  it('entering an email and submitting calls signInWithEmail with that email', async () => {
    signInWithEmail.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('jay@example.com'))
  })

  it('shows a "Check your email" confirmation naming the address after a successful send', async () => {
    signInWithEmail.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(screen.getByText(/jay@example\.com/)).toBeInTheDocument()
  })

  it('lets the user return to the form via "Use a different email"', async () => {
    signInWithEmail.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))
    await screen.findByText(/check your email/i)

    await user.click(screen.getByRole('button', { name: /use a different email/i }))

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })

  it('does not call signInWithEmail for an empty or invalid email', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(signInWithEmail).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('renders a visible, announced error when signInWithEmail throws', async () => {
    // ⚠️ SECOND REPOINTED ANCHOR (6 Aug 2026), same cause as the one in the
    // authError block below. 'rate limited' was an arbitrary string here too,
    // and friendlyAuthError() now translates it — which would have made this
    // test assert the wrong thing while still looking correct. What it is
    // really about is that an error reaches the user in an announced
    // role="alert" region, so it is repointed at a message that passes
    // through untouched.
    signInWithEmail.mockRejectedValue(new Error('Email address is invalid'))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email address is invalid')
  })

  it('disables the submit button while sending', async () => {
    let resolveSend
    signInWithEmail.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    )
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    const submit = screen.getByRole('button', { name: /email me a link/i })
    await user.click(submit)

    expect(submit).toBeDisabled()

    resolveSend()
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('calls signInWithGoogle when the Google button is clicked', async () => {
    signInWithGoogle.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('renders a visible, announced error when signInWithGoogle throws', async () => {
    signInWithGoogle.mockRejectedValue(new Error('oauth misconfigured'))
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('oauth misconfigured')
  })
})

describe('Login screen authError prop', () => {
  // authError is what RequireAuth passes in when the visitor arrived via a
  // failed magic-link/OAuth redirect (e.g. an expired link). It shares the
  // same alert region as the screen's own errors rather than a second one.

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

  it('clears the passed-in authError once the user requests a new link by email', async () => {
    signInWithEmail.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login authError="Email link is invalid or has expired" />)

    expect(screen.getByRole('alert')).toHaveTextContent("didn't work")

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the passed-in authError once the user retries with Google', async () => {
    signInWithGoogle.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Login authError="Email link is invalid or has expired" />)

    expect(screen.getByRole('alert')).toHaveTextContent("didn't work")

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('does not resurrect the passed-in authError alongside a fresh error from a failed retry', async () => {
    // ⚠️ ANCHOR REPOINTED, NOT DELETED (6 Aug 2026). This used to reject with
    // `new Error('rate limited')`, chosen as an arbitrary error string. It
    // stopped being arbitrary the moment friendlyAuthError() started
    // translating anything matching /rate limit/i — the test would then pass
    // or fail for a reason unrelated to what it is actually about, which is
    // that a FRESH error replaces the stale authError. Repointed at an error
    // the helper passes through untouched.
    signInWithEmail.mockRejectedValue(new Error('Email address is invalid'))
    const user = userEvent.setup()
    render(<Login authError="Email link is invalid or has expired" />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email address is invalid')
    expect(alert).not.toHaveTextContent("didn't work")
  })
})

// ---------------------------------------------------------------------------
// The rate-limit translation.
//
// Supabase's ceiling on auth emails (Authentication → Rate Limits) is the one
// failure a normal parent will actually meet, because the rollout invites a
// whole age group at once. GoTrue returns the bare string "email rate limit
// exceeded" and this screen used to render it verbatim.
//
// ⚠️ Live value read from the dashboard on 6 Aug 2026: **2 emails/hour**, not
// the 30 the docs quote for custom SMTP — this project uses a Send Email Auth
// Hook, which Supabase does not treat as custom SMTP. So this path is not
// hypothetical; it is reachable on the third sign-in of any hour.
// ---------------------------------------------------------------------------
describe('Login — rate-limit message', () => {
  it('replaces the raw Supabase text with something a parent can act on', async () => {
    signInWithEmail.mockRejectedValue(new Error('email rate limit exceeded'))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    const alert = await screen.findByRole('alert')
    // The raw string must not survive: it reads as an accusation, names no
    // remedy, and gives no hint that waiting fixes it.
    expect(alert).not.toHaveTextContent('email rate limit exceeded')
    // Waiting IS the fix, so the copy has to say so...
    expect(alert).toHaveTextContent(/wait a couple of minutes/i)
    // ...and it has to point at the path that costs no email at all, which is
    // the whole reason this is survivable.
    expect(alert).toHaveTextContent(/continue with google/i)
  })

  it('recognises the 429 wording too, not just the one phrase', async () => {
    signInWithEmail.mockRejectedValue(new Error('Request failed: 429 Too Many Requests'))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/wait a couple of minutes/i)
  })

  it('leaves every other auth error exactly as it was', async () => {
    // The helper is a narrow allow-list on purpose. A general error
    // prettifier would swallow messages that are more useful raw — to the
    // user AND to whoever they forward the screenshot to.
    signInWithEmail.mockRejectedValue(new Error('Signups not allowed for this instance'))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Signups not allowed for this instance')
    expect(alert).not.toHaveTextContent(/wait a couple of minutes/i)
  })

  it('still falls back when the error carries no message at all', async () => {
    signInWithEmail.mockRejectedValue(new Error(''))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /something went wrong sending the link/i,
    )
  })
})
