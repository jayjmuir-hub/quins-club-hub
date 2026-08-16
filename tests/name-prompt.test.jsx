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
const confirmMyDetailsMock = vi.fn()
const confirmNoPlayerMock = vi.fn()
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
  confirmMyDetails: (...args) => confirmMyDetailsMock(...args),
  confirmNoPlayer: (...args) => confirmNoPlayerMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  // The squad picker's source (16 Aug 2026). An unmocked export is undefined,
  // and calling it in an effect throws before anything renders.
  listSquadsForRequest: async () => [],
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
  const memberships = overrides.memberships ?? [{ role: 'admin', team_id: null }]
  return {
    memberships,
    // ⚠️ MIRRORS THE REAL PROVIDER: `realMemberships` is the truth and
    // `memberships` is what screens act on, and they DIFFER during a preview.
    // Defaulting them to the same array keeps every existing case honest while
    // letting the preview cases below set them apart deliberately.
    realMemberships: memberships,
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
// ⚠️ THE DEFAULT ANSWERS THE TWO NEWER GATES, so every case below it stays
// about the NAME — which is what those cases were written for. The phone and
// player gates get their own block at the end of this file, where the fixture
// deliberately withholds each in turn. Without this the whole suite would drift
// into testing three things at once and being clear about none of them.
function unconfirmed(overrides = {}) {
  return {
    id: 'u-1',
    full_name: 'Jason Muir',
    first_name: 'Jason',
    last_name: 'Muir',
    name_confirmed_at: null,
    email: 'jay@example.com',
    phone: '+971500000000',
    no_player_confirmed_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  // ⚠️ RESET BY NAME, NOT vi.clearAllMocks(), WHICH MAKES A NEW MOCK EASY TO
  // MISS — and one was, on 16 Aug 2026. `confirmNoPlayerMock` was added to the
  // seeding below and not to this list, so its CALL COUNT leaked from one test
  // into the next: "does not record a confirmation when they choose to add one"
  // failed against a call the previous case had made. The component was right
  // and the harness was wrong, which is the more expensive way round.
  useAuthMock.mockReset()
  confirmNoPlayerMock.mockReset()
  useMembershipsMock.mockReset()
  getMyProfileMock.mockReset()
  confirmMyDetailsMock.mockReset()
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
  confirmMyDetailsMock.mockResolvedValue({
    id: 'u-1',
    name_confirmed_at: '2026-08-06T12:00:00Z',
    no_player_confirmed_at: '2026-08-01T00:00:00Z',
  })
  confirmNoPlayerMock.mockResolvedValue({ id: 'u-1', no_player_confirmed_at: '2026-08-16T12:00:00Z' })
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

  it('saves first and family name via confirmMyDetails', async () => {
    const user = userEvent.setup()
    await openGate()

    await user.clear(screen.getByLabelText(/first name/i))
    await user.type(screen.getByLabelText(/first name/i), '  Jay  ')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(confirmMyDetailsMock).toHaveBeenCalledWith({
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
    confirmMyDetailsMock.mockResolvedValue(
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
    await waitFor(() => expect(confirmMyDetailsMock).toHaveBeenCalled())

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
      expect(confirmMyDetailsMock).toHaveBeenCalledWith({
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
    expect(confirmMyDetailsMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: GATE_TITLE })).toBeInTheDocument()
  })

  it('surfaces a save failure and keeps the gate open', async () => {
    const user = userEvent.setup()
    confirmMyDetailsMock.mockRejectedValue(new Error('permission denied for table profiles'))
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

/* ══════════════════════════════════════════════════════════════════════════
   The phone and player gates — 16 Aug 2026
   ══════════════════════════════════════════════════════════════════════════

   Jay: "we need to have a pop up that forces people to fill out their full name
   and phone number later on when they login again, if they haven't fill that
   out, also force them to add a player or confirm again 1 time they don't have
   a player".

   ⚠️ MEASURED BEFORE BUILDING: 14 of 27 profiles had no phone, against 1 with no
   name. The name half of that request was already working — `NamePrompt` has
   been a hard gate since 6 Aug — so the phone and the player question are the
   parts that were actually missing.

   ⚠️ THE FIXTURE ABOVE ANSWERS BOTH BY DEFAULT so the older cases stay about the
   name. Each case here withholds exactly one thing.
   ══════════════════════════════════════════════════════════════════════════ */

describe('NamePrompt — the phone gate', () => {
  const noPhone = (overrides = {}) =>
    unconfirmed({ phone: null, name_confirmed_at: '2026-08-01T00:00:00Z', ...overrides })

  it('opens for somebody who has confirmed a name but has no phone', async () => {
    getMyProfileMock.mockResolvedValue(noPhone())
    renderShell()

    expect(await screen.findByLabelText(/phone number/i)).toBeInTheDocument()
  })

  // ⚠️ THE ONE THAT KEEPS IT FROM BEING A NAG. Somebody who already gave a
  // number must not be made to re-enter it to get past a gate they are only
  // meeting for the name.
  it('⚠️ does not ask for a phone when one is already on file', async () => {
    getMyProfileMock.mockResolvedValue(unconfirmed())
    renderShell()

    await screen.findByLabelText(/first name/i)
    expect(screen.queryByLabelText(/phone number/i)).toBeNull()
  })

  // ⚠️ SAFEGUARDING, NOT TIDINESS. This app already refuses to let an under-13
  // hold their own contact details (allowsOwnContact). A gate that demands a
  // phone number from a child account is the app arguing with its own rule.
  it('⚠️ never asks a player-only account for a phone', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'player', team_id: 't1' }] }))
    getMyProfileMock.mockResolvedValue(noPhone({ name_confirmed_at: null }))
    renderShell()

    await screen.findByLabelText(/first name/i)
    expect(screen.queryByLabelText(/phone number/i)).toBeNull()
  })

  it('refuses to close without one, and does not call the data layer', async () => {
    getMyProfileMock.mockResolvedValue(noPhone())
    const user = userEvent.setup()
    renderShell()

    await screen.findByLabelText(/phone number/i)
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/phone number/i)
    expect(confirmMyDetailsMock).not.toHaveBeenCalled()
  })
})

describe('NamePrompt — the player gate', () => {
  const noPlayer = (overrides = {}) =>
    unconfirmed({
      name_confirmed_at: '2026-08-01T00:00:00Z',
      no_player_confirmed_at: null,
      ...overrides,
    })

  it('asks somebody with no linked child', async () => {
    getMyProfileMock.mockResolvedValue(noPlayer())
    renderShell()

    expect(await screen.findByText(/do you have a player at the club/i)).toBeInTheDocument()
  })

  // ⚠️ THE "1 TIME" IN THE REQUEST, AND THE WHOLE REASON THE COLUMN EXISTS. A
  // coach with no children at the club would otherwise meet this at every
  // sign-in forever, which is how a gate becomes something people dismiss
  // without reading.
  it('⚠️ never asks again once somebody has said they have none', async () => {
    getMyProfileMock.mockResolvedValue(
      noPlayer({ no_player_confirmed_at: '2026-08-10T00:00:00Z' }),
    )
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByText(/do you have a player/i)).toBeNull()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
  })

  it('⚠️ never asks somebody who already has a child linked', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [{ role: 'parent', team_id: 't1', player_id: 'p1' }] }),
    )
    getMyProfileMock.mockResolvedValue(noPlayer())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByText(/do you have a player/i)).toBeNull()
  })

  it('⚠️ never asks a player-only account — it IS the player', async () => {
    useMembershipsMock.mockReturnValue(loaded({ memberships: [{ role: 'player', team_id: 't1' }] }))
    getMyProfileMock.mockResolvedValue(noPlayer())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByText(/do you have a player/i)).toBeNull()
  })

  it('records the answer and closes', async () => {
    getMyProfileMock.mockResolvedValue(noPlayer())
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByTestId('no-player'))

    await waitFor(() => expect(confirmNoPlayerMock).toHaveBeenCalledWith({ profileId: 'u-1' }))
    await waitFor(() => expect(screen.queryByText(/do you have a player/i)).toBeNull())
  })

  // ⚠️ THE SECOND HALF OF THE GATE, NOT A SECOND GATE. Somebody who arrives
  // needing both must not have the app flash between two sheets — the details
  // step hands straight over.
  it('⚠️ follows the details step straight into the player question', async () => {
    getMyProfileMock.mockResolvedValue(unconfirmed({ no_player_confirmed_at: null }))
    confirmMyDetailsMock.mockResolvedValue({
      id: 'u-1',
      name_confirmed_at: '2026-08-16T12:00:00Z',
      no_player_confirmed_at: null,
    })
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/do you have a player at the club/i)).toBeInTheDocument()
  })

  // ⚠️ TAPPING "Add my player" IS NOT AN ANSWER. Somebody who taps it and then
  // abandons the form still has no player, so the gate is right to ask again.
  it('⚠️ does not record a confirmation when they choose to add one', async () => {
    getMyProfileMock.mockResolvedValue(noPlayer())
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: /add my player/i }))
    expect(confirmNoPlayerMock).not.toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   "View as" must not make the gate forget your children — 16 Aug 2026
   ══════════════════════════════════════════════════════════════════════════

   Jay, with two sons already linked: "this has popped up twice in my own
   account… actually, it is specific to when i change viewing as".

   ⚠️ A PREVIEW REPLACES THE EFFECTIVE MEMBERSHIPS WITH ONE SYNTHETIC ROW, and
   that row hardcodes `player_id: null` — see syntheticMemberships in
   src/lib/memberships.jsx. Reading the effective set therefore made an admin
   with two children look like somebody with none, every time they switched.

   The rule is the one that file already states for the switcher and the banner:
   gate on `realMemberships`. A preview is cosmetic; whether you have a child at
   the club is a fact about you.
   ══════════════════════════════════════════════════════════════════════════ */

describe('NamePrompt — a preview must not reopen the gate', () => {
  // Exactly what the provider builds while previewing: the real rows say this
  // person is a parent of two, the effective row says nothing at all.
  const previewing = () =>
    loaded({
      memberships: [
        { id: 'view-as', role: 'coach', team_id: 't1', player_id: null, status: 'active' },
      ],
      realMemberships: [
        { role: 'admin', team_id: null, player_id: null, status: 'active' },
        { role: 'parent', team_id: 't-u13', player_id: 'p1', status: 'active' },
        { role: 'parent', team_id: 't-u16', player_id: 'p2', status: 'active' },
      ],
      viewAs: { role: 'coach', teamId: 't1' },
    })

  it('⚠️ does not ask an admin with children whether they have a player', async () => {
    useMembershipsMock.mockReturnValue(previewing())
    getMyProfileMock.mockResolvedValue(
      unconfirmed({ name_confirmed_at: '2026-08-01T00:00:00Z', no_player_confirmed_at: null }),
    )
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByText(/do you have a player at the club/i)).toBeNull()
  })

  // ⚠️ THE OTHER HALF OF THE SAME MISTAKE. Previewing as a player would have
  // exempted an admin from the phone question, because playerOnly read the
  // effective set too.
  it('⚠️ still asks for a phone while previewing as a player', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({
        memberships: [{ id: 'view-as', role: 'player', team_id: 't1', status: 'active' }],
        realMemberships: [{ role: 'admin', team_id: null, status: 'active' }],
        viewAs: { role: 'player', teamId: 't1' },
      }),
    )
    getMyProfileMock.mockResolvedValue(
      unconfirmed({ phone: null, name_confirmed_at: '2026-08-01T00:00:00Z' }),
    )
    renderShell()

    expect(await screen.findByLabelText(/phone number/i)).toBeInTheDocument()
  })

  // And a genuine player-only account — not a preview — is still exempt.
  it('leaves a real player-only account alone', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [{ role: 'player', team_id: 't1', status: 'active' }] }),
    )
    getMyProfileMock.mockResolvedValue(
      unconfirmed({ phone: null, name_confirmed_at: '2026-08-01T00:00:00Z' }),
    )
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByLabelText(/phone number/i)).toBeNull()
  })
})
