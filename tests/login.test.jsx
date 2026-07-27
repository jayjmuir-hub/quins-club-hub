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

  it('names the app and gives one-sentence invite-only context', () => {
    render(<Login />)

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByText('Quins Club Hub')).toBeInTheDocument()
    expect(screen.getByText(/invite-only/i)).toBeInTheDocument()
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
    signInWithEmail.mockRejectedValue(new Error('rate limited'))
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(/email/i), 'jay@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('rate limited')
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
