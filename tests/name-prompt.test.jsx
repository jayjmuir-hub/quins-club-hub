import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for the first-login display-name prompt (plan Task C:
// docs/superpowers/plans/2026-08-03-pending-access.md). Exercised through
// AppShell, because half of what the prompt has to get right is *where* it
// shows: never for a user with zero memberships (they already get the "no
// access yet" screen), only once memberships have loaded.
//
// Same mocking style as tests/app-shell.test.jsx: useAuth and useMemberships
// are mocked, plus src/data/members.js so no network is ever reachable here.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const getMyProfileMock = vi.fn()
const updateProfileNameMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
}))

// Import after vi.mock so these bind to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']} future={routerFuture}>
      <AppShell>
        <div>Routed content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

function loaded(overrides = {}) {
  return {
    memberships: [{ role: 'admin', team_id: null }],
    teams: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  }
}

const PROMPT_TITLE = /what should we call you/i

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  getMyProfileMock.mockReset()
  updateProfileNameMock.mockReset()
  window.localStorage.clear()

  useAuthMock.mockReturnValue({
    user: { id: 'u-1', email: 'jay@example.com' },
    signOut: vi.fn(),
  })
  useMembershipsMock.mockReturnValue(loaded())
  getMyProfileMock.mockResolvedValue({ id: 'u-1', full_name: '', email: 'jay@example.com' })
  updateProfileNameMock.mockResolvedValue({ id: 'u-1', full_name: 'Jay Muir' })
})

describe('NamePrompt', () => {
  it('prompts for a name when the signed-in user has a blank name', async () => {
    renderShell()

    expect(await screen.findByRole('dialog', { name: PROMPT_TITLE })).toBeInTheDocument()
    expect(getMyProfileMock).toHaveBeenCalledWith('u-1')
    // It must not block the app: the routed content is still there behind it.
    expect(screen.getByText('Routed content')).toBeInTheDocument()
  })

  it('treats a whitespace-only name as blank', async () => {
    getMyProfileMock.mockResolvedValue({ id: 'u-1', full_name: '   ' })

    renderShell()

    expect(await screen.findByRole('dialog', { name: PROMPT_TITLE })).toBeInTheDocument()
  })

  it('does not prompt when the user already has a name', async () => {
    getMyProfileMock.mockResolvedValue({ id: 'u-1', full_name: 'Jay Muir' })

    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not prompt a user with no memberships — they get the no-access screen instead', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [] }))

    renderShell()

    expect(await screen.findByText(/jay@example.com/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(getMyProfileMock).not.toHaveBeenCalled()
  })

  it('saves the name via updateProfileName and closes', async () => {
    const user = userEvent.setup()
    renderShell()

    await screen.findByRole('dialog', { name: PROMPT_TITLE })
    await user.type(screen.getByLabelText(/your name/i), '  Jay Muir  ')
    await user.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateProfileNameMock).toHaveBeenCalledWith({ profileId: 'u-1', fullName: 'Jay Muir' })
  })

  it('refuses a blank submission without calling the data layer', async () => {
    const user = userEvent.setup()
    renderShell()

    await screen.findByRole('dialog', { name: PROMPT_TITLE })
    await user.click(screen.getByRole('button', { name: /save name/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your name/i)
    expect(updateProfileNameMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: PROMPT_TITLE })).toBeInTheDocument()
  })

  it('surfaces a save failure and keeps the prompt open', async () => {
    updateProfileNameMock.mockRejectedValue(new Error('permission denied'))
    const user = userEvent.setup()
    renderShell()

    await screen.findByRole('dialog', { name: PROMPT_TITLE })
    await user.type(screen.getByLabelText(/your name/i), 'Jay Muir')
    await user.click(screen.getByRole('button', { name: /save name/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission denied/i)
    expect(screen.getByRole('dialog', { name: PROMPT_TITLE })).toBeInTheDocument()
  })

  it('skipping closes it and it does not come back on re-render', async () => {
    const user = userEvent.setup()
    const { rerender } = renderShell()

    await screen.findByRole('dialog', { name: PROMPT_TITLE })
    await user.click(screen.getByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    rerender(
      <MemoryRouter initialEntries={['/']} future={routerFuture}>
        <AppShell>
          <div>Routed content</div>
        </AppShell>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Routed content')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateProfileNameMock).not.toHaveBeenCalled()
  })

  it('stays skipped for the same user across a fresh mount (localStorage), and is not a database write', async () => {
    const user = userEvent.setup()
    const first = renderShell()

    await screen.findByRole('dialog', { name: PROMPT_TITLE })
    await user.click(screen.getByRole('button', { name: /not now/i }))
    first.unmount()

    getMyProfileMock.mockClear()
    renderShell()

    await waitFor(() => expect(screen.getByText('Routed content')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The skip flag is client-side only — nothing was written to profiles.
    expect(getMyProfileMock).not.toHaveBeenCalled()
    expect(updateProfileNameMock).not.toHaveBeenCalled()
  })

  it('still prompts a different user signing in on the same device', async () => {
    const user = userEvent.setup()
    const first = renderShell()

    await screen.findByRole('dialog', { name: PROMPT_TITLE })
    await user.click(screen.getByRole('button', { name: /not now/i }))
    first.unmount()

    useAuthMock.mockReturnValue({
      user: { id: 'u-2', email: 'janice@example.com' },
      signOut: vi.fn(),
    })
    getMyProfileMock.mockResolvedValue({ id: 'u-2', full_name: '' })

    renderShell()

    expect(await screen.findByRole('dialog', { name: PROMPT_TITLE })).toBeInTheDocument()
  })

  it('stays silent when the profile read fails — a cosmetic prompt must not break the app', async () => {
    getMyProfileMock.mockRejectedValue(new Error('network unreachable'))

    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.getByText('Routed content')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays silent when the profile row does not exist yet (trigger lag)', async () => {
    getMyProfileMock.mockResolvedValue(null)

    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
