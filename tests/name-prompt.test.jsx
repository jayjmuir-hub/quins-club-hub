import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for the sign-in NAME GATE
// (claude/decisions/2026-08-06-roster-auto-onboarding.md).
//
// ⚠️ THESE TESTS WERE REPOINTED, NOT REWRITTEN FROM NOTHING. This file used to
// cover a skippable prompt keyed on "is full_name blank", with a "Not now"
// button and a localStorage suppressor. All three of those are gone on
// purpose, and the assertions that guarded them have been turned into their
// opposites rather than deleted — "skipping closes it" is now "there is
// nothing to skip with", and "stays skipped across a fresh mount via
// localStorage" is now "localStorage is not consulted at all". Deleting them
// would have left the reversal unguarded.
//
// Exercised through AppShell, because half of what the gate has to get right
// is *where* it shows: never for a user with zero memberships, who gets
// RequestAccess instead.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const getMyProfileMock = vi.fn()
const updateProfileNamesMock = vi.fn()
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  getMyAccessRequest: (...args) => getMyAccessRequestMock(...args),
  createAccessRequest: (...args) => createAccessRequestMock(...args),
}))

// Import after vi.mock so these bind to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

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

const GATE_TITLE = /what should we call you/i

// An UNCONFIRMED profile that already carries a name. This is the Google case
// and it is the important one: full_name is populated, so any implementation
// that gates on "is the name blank" would let it straight through.
function unconfirmed(overrides = {}) {
  return {
    id: 'u-1',
    full_name: 'Jason Muir',
    first_name: 'Jason',
    last_name: 'Muir',
    name_confirmed_at: null,
    email: 'jay@example.com',
    ...overrides,
  }
}

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  getMyProfileMock.mockReset()
  updateProfileNamesMock.mockReset()
  getMyAccessRequestMock.mockReset()
  createAccessRequestMock.mockReset()
  getMyAccessRequestMock.mockResolvedValue(null)
  window.localStorage.clear()
  // useMyProfile's cache is module-level and survives a render, so without this
  // one test's profile row leaks into the next. Same reason
  // tests/app-shell.test.jsx clears it.
  clearMyProfileCache()

  useAuthMock.mockReturnValue({
    user: { id: 'u-1', email: 'jay@example.com' },
    signOut: vi.fn(),
  })
  useMembershipsMock.mockReturnValue(loaded())
  getMyProfileMock.mockResolvedValue(unconfirmed())
  updateProfileNamesMock.mockResolvedValue({ id: 'u-1', name_confirmed_at: '2026-08-06T12:00:00Z' })
})

describe('NamePrompt — the sign-in name gate', () => {
  it('opens for an unconfirmed name EVEN WHEN one is already populated', async () => {
    // The Jason/Jay case. Google supplied a name; nobody at the club uses it.
    expect(await openGate()).toBeInTheDocument()
    expect(getMyProfileMock).toHaveBeenCalledWith('u-1')
  })

  it('prefills the fields it already holds, so confirming is not retyping', async () => {
    await openGate()

    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jason')
    expect(screen.getByLabelText(/family name/i)).toHaveValue('Muir')
  })

  it('opens with empty fields for a magic-link user, who arrives with no name', async () => {
    getMyProfileMock.mockResolvedValue(
      unconfirmed({ full_name: '', first_name: null, last_name: null }),
    )
    await openGate()

    expect(screen.getByLabelText(/first name/i)).toHaveValue('')
    expect(screen.getByLabelText(/family name/i)).toHaveValue('')
  })

  it('does not open once the name has been confirmed', async () => {
    getMyProfileMock.mockResolvedValue(
      unconfirmed({ name_confirmed_at: '2026-08-06T09:00:00Z' }),
    )
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: GATE_TITLE })).not.toBeInTheDocument()
  })

  // --- the hard-gate assertions ------------------------------------------
  // Each of these replaces an assertion that used to guarantee the opposite.

  it('offers no way out: no Not now, no Close button', async () => {
    await openGate()

    expect(screen.queryByRole('button', { name: /not now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
  })

  it('does not close on Escape', async () => {
    const user = userEvent.setup()
    await openGate()

    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: GATE_TITLE })).toBeInTheDocument()
  })

  it('does not consult localStorage, so it cannot be escaped on another device', async () => {
    // The old implementation wrote 'quins.namePromptSkipped'. Pre-seeding it
    // with this user's id would have suppressed the prompt entirely.
    window.localStorage.setItem('quins.namePromptSkipped', 'u-1')

    expect(await openGate()).toBeInTheDocument()
  })

  // --- saving --------------------------------------------------------------

  it('saves first and family name via updateProfileNames', async () => {
    const user = userEvent.setup()
    await openGate()

    await user.clear(screen.getByLabelText(/first name/i))
    await user.type(screen.getByLabelText(/first name/i), '  Jay  ')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(updateProfileNamesMock).toHaveBeenCalledWith({
        profileId: 'u-1',
        firstName: 'Jay',
        lastName: 'Muir',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: GATE_TITLE })).not.toBeInTheDocument(),
    )
  })

  // ⚠️ THE JASON/JAY CASE AGAIN, ONE STEP LATER. The tests above are about what
  // the gate ASKS; this is about what happens to the answer. useMyProfile
  // caches the profile row at module level and never invalidates it, so after
  // the gate saved, every consumer — the masthead account button, the dashboard
  // greeting — was still holding the row from BEFORE: no name at all for a
  // password sign-up, and the wrong name for a Google one. Priming the cache is
  // the documented escape hatch, and src/screens/More.jsx already does it after
  // its own save.
  //
  // ⚠️ WHAT THIS DOES NOT CLAIM. The contract is "the next mount", not "the
  // masthead changes as you press Continue" — priming replaces the cache entry,
  // it does not re-render components already holding the old row. So this
  // remounts, which is what any route change does.
  it('primes the profile cache, so the name it just took reaches the masthead', async () => {
    const user = userEvent.setup()
    updateProfileNamesMock.mockResolvedValue(
      unconfirmed({
        full_name: 'Jay Muir',
        first_name: 'Jay',
        name_confirmed_at: '2026-08-06T12:00:00Z',
      }),
    )

    await openGate()
    await user.clear(screen.getByLabelText(/first name/i))
    await user.type(screen.getByLabelText(/first name/i), 'Jay')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(updateProfileNamesMock).toHaveBeenCalled())

    cleanup()
    renderShell()

    // Without the prime this reads "My account, Jason" — the name Google
    // supplied and nobody at this club uses, served from a cache the gate had
    // just been told was wrong.
    await waitFor(() =>
      expect(screen.getByTestId('account-button')).toHaveAttribute(
        'aria-label',
        'My account, Jay',
      ),
    )
  })

  it('accepts a first name alone — a family name is not required', async () => {
    const user = userEvent.setup()
    getMyProfileMock.mockResolvedValue(
      unconfirmed({ full_name: 'Ronaldinho', first_name: 'Ronaldinho', last_name: null }),
    )
    await openGate()

    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(updateProfileNamesMock).toHaveBeenCalledWith({
        profileId: 'u-1',
        firstName: 'Ronaldinho',
        lastName: '',
      }),
    )
  })

  it('refuses a blank first name without calling the data layer', async () => {
    const user = userEvent.setup()
    await openGate()

    await user.clear(screen.getByLabelText(/first name/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your first name/i)
    expect(updateProfileNamesMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: GATE_TITLE })).toBeInTheDocument()
  })

  it('surfaces a save failure and keeps the gate open', async () => {
    const user = userEvent.setup()
    updateProfileNamesMock.mockRejectedValue(new Error('permission denied for table profiles'))
    await openGate()

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission denied/i)
    expect(screen.getByRole('dialog', { name: GATE_TITLE })).toBeInTheDocument()
  })

  it('stays shut when the profile read fails — a blip must not lock anyone out', async () => {
    getMyProfileMock.mockRejectedValue(new Error('network'))
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: GATE_TITLE })).not.toBeInTheDocument()
    expect(screen.getByText('Routed content')).toBeInTheDocument()
  })

  // ⚠️ REPOINTED 8 Aug 2026, and the reason matters more than the edit. The
  // zero-membership branch of AppShell used to render RequestAccess directly;
  // it now renders AddYourPlayer first, with RequestAccess as the secondary
  // route behind a button (parent self-registration). So the old
  // `waitFor(getMyAccessRequestMock called)` could never resolve, and the
  // assertion after it would never have run.
  //
  // The point of the test is unchanged: the name gate must never appear over a
  // screen that is telling somebody they have no access. Both zero-access
  // screens are checked now, because the gate would be equally wrong on either.
  it('never shows to someone with no access — on either zero-access screen', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], teams: [{ id: 't1', name: 'U13', sort_order: 1 }] }),
    )
    renderShell()

    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: GATE_TITLE })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /not adding a player/i }))

    await waitFor(() => expect(getMyAccessRequestMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: GATE_TITLE })).not.toBeInTheDocument()
  })
})

async function openGate() {
  renderShell()
  return screen.findByRole('dialog', { name: GATE_TITLE })
}
