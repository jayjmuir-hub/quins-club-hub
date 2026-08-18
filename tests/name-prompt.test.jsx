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
const confirmNoRoleMock = vi.fn()
const requestStaffRoleMock = vi.fn()
const updateProfileNamesMock = vi.fn(async () => ({
  id: 'user-1',
  first_name: 'Jay',
  name_confirmed_at: '2026-08-17T00:00:00Z',
}))
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()
const listPlayerPrivateMock = vi.fn()
const listPlayersMock = vi.fn()
const setPlayerDobMock = vi.fn()
const updatePlayerDobMock = vi.fn()

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
  confirmNoRole: (...args) => confirmNoRoleMock(...args),
  requestStaffRole: (...args) => requestStaffRoleMock(...args),
  // ⚠️ THE ROLL-CALL'S NAME WRITE, ADDED 17 Aug 2026. This file renders the
  // whole AppShell, so the zero-membership test below walks through RollCall —
  // which asks for a name and calls this. Missing, it threw from inside a
  // promise chain: the test still PASSED (it only asserts a dialog is absent)
  // while vitest logged "No updateProfileNames export is defined". A passing
  // test with an unhandled error underneath it is the shape that hides the next
  // real one.
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
}))

// ⚠️ SPREAD THE REAL MODULE, DON'T REPLACE IT. This file renders the whole
// AppShell, and several components under it import from players.js — an
// exports-only mock makes every unlisted one `undefined`, which throws from
// inside a promise chain and can leave a test PASSING with the error logged
// underneath. That exact shape is documented on the members.js mock above.
vi.mock('../src/data/players.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listPlayerPrivate: (...args) => listPlayerPrivateMock(...args),
  listPlayers: (...args) => listPlayersMock(...args),
  // BOTH writers are mocked so a test can assert which one was reached. They
  // are not interchangeable — see the play-up case below.
  setPlayerDob: (...args) => setPlayerDobMock(...args),
  updatePlayerDob: (...args) => updatePlayerDobMock(...args),
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
  const memberships = overrides.memberships ?? [{ role: 'admin', status: 'active', team_id: null }]
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
    // ⚠️ ANSWERED HERE FOR THE SAME REASON no_player_confirmed_at IS — so every
    // case above stays about the thing it was written for. The role gate has its
    // own block at the end of this file, where the fixture withholds it.
    no_role_confirmed_at: '2026-08-01T00:00:00Z',
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
  confirmNoRoleMock.mockReset()
  requestStaffRoleMock.mockReset()
  useMembershipsMock.mockReset()
  getMyProfileMock.mockReset()
  confirmMyDetailsMock.mockReset()
  getMyAccessRequestMock.mockReset()
  createAccessRequestMock.mockReset()
  listPlayerPrivateMock.mockReset()
  listPlayersMock.mockReset()
  setPlayerDobMock.mockReset()
  updatePlayerDobMock.mockReset()
  getMyAccessRequestMock.mockResolvedValue(null)
  // ⚠️ THE DEFAULT MEMBERSHIP CARRIES NO player_id, so the birthday gate is not
  // due in any case above and these seeds are never consulted by them. They are
  // here so that an unexpected call returns a sane value rather than undefined.
  listPlayerPrivateMock.mockResolvedValue([])
  listPlayersMock.mockResolvedValue([])
  setPlayerDobMock.mockResolvedValue({ player_id: 'p-1', date_of_birth: '2015-03-04' })
  updatePlayerDobMock.mockResolvedValue({ player_id: 'p-1', date_of_birth: '2015-03-04' })
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
  confirmNoRoleMock.mockResolvedValue({ id: 'u-1', no_role_confirmed_at: '2026-08-16T12:00:00Z' })
  requestStaffRoleMock.mockResolvedValue({
    id: 'm-new',
    role: 'coach',
    team_id: 't-u12',
    status: 'pending',
  })
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

  // ⚠️ REPOINTED TWICE, AND THE SECOND TIME IS THE INTERESTING ONE.
  //
  // 8 Aug 2026: the zero-membership branch stopped rendering RequestAccess
  // directly and rendered AddYourPlayer first, with RequestAccess behind a
  // button — so the old `waitFor(getMyAccessRequestMock called)` could never
  // resolve and the assertion after it never ran.
  //
  // 17 Aug 2026: that fork is GONE. AppShell renders RollCall, and both former
  // screens are sections of it. The gate would be wrong on any of them, so this
  // walks the roll-call rather than clicking between two doors.
  //
  // ⚠️ THE POINT IS UNCHANGED AND IS WHY THIS TEST SURVIVES EVERY REWRITE: the
  // name gate must never appear over a screen that is telling somebody they have
  // no access — and NamePrompt is mounted in AppShell's `ready` branch, which
  // requires a membership, so this is the assertion that keeps it there.
  it('never shows to someone with no access — on any part of the roll-call', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [], teams: [{ id: 't1', name: 'U13', sort_order: 1 }] }),
    )
    renderShell()

    // The ask itself.
    await user.click(await screen.findByRole('checkbox', { name: /help the club another way/i }))
    expect(screen.queryByRole('dialog', { name: GATE_TITLE })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^continue$/i }))

    // …and the ask-the-club section behind it.
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
        { role: 'admin', status: 'active', team_id: null, player_id: null },
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
        realMemberships: [{ role: 'admin', status: 'active', team_id: null }],
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

// ── THE ROLE GATE — the mirror of the player gate ──────────────────────────
//
// ⚠️ THE BUG THIS EXISTS FOR IS A REAL ROW. Jay, 16 Aug 2026, about a coach who
// had signed up through the parent door: "he got through without asking to be
// designated a coach". Sign-up forks two ways and whichever door somebody takes,
// the other half of who they are is never asked for again. The player gate
// covers the staff door. Nothing covered the parent door until this.
describe('NamePrompt — the role gate', () => {
  // A parent of one, fully answered on every OTHER gate, who has never been
  // asked what they do at the club. This is the shape of the real row exactly.
  const parentOfOne = (overrides = {}) =>
    loaded({
      memberships: [{ role: 'parent', team_id: 't-u12', player_id: 'p1', status: 'active' }],
      teams: [
        { id: 't-u12', name: 'U12 Mixed', sort_order: 2 },
        { id: 't-u10', name: 'U10 Mixed', sort_order: 1 },
      ],
      ...overrides,
    })

  const unasked = (overrides = {}) =>
    unconfirmed({
      name_confirmed_at: '2026-08-01T00:00:00Z',
      no_role_confirmed_at: null,
      ...overrides,
    })

  // ⚠️ A BIRTHDAY ON FILE FOR p1, AND IT IS NOT PADDING — 17 Aug 2026. The
  // birthday step was added AHEAD of the role step in the fall-through, and
  // `parentOfOne` carries a linked child. Without this, every case in this block
  // gets the birthday sheet instead of the role sheet and fails for a reason
  // that has nothing to do with roles. Same discipline as the file header: each
  // block answers the OTHER gates so it stays about its own.
  beforeEach(() => {
    listPlayerPrivateMock.mockResolvedValue([{ player_id: 'p1', date_of_birth: '2015-03-04' }])
  })

  it('asks a parent who has never said what they do', async () => {
    useMembershipsMock.mockReturnValue(parentOfOne())
    getMyProfileMock.mockResolvedValue(unasked())
    renderShell()

    expect(await screen.findByText(/besides being a parent/i)).toBeInTheDocument()
  })

  it('⚠️ never asks again once somebody has said they do nothing else', async () => {
    useMembershipsMock.mockReturnValue(parentOfOne())
    getMyProfileMock.mockResolvedValue(unasked({ no_role_confirmed_at: '2026-08-10T00:00:00Z' }))
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByText(/besides being a parent/i)).toBeNull()
    expect(screen.queryByTestId('claim-role')).toBeNull()
  })

  it('⚠️ never asks somebody who already holds a staff role', async () => {
    useMembershipsMock.mockReturnValue(
      parentOfOne({
        memberships: [
          { role: 'parent', team_id: 't-u12', player_id: 'p1', status: 'active' },
          { role: 'coach', team_id: 't-u12', player_id: null, status: 'active' },
        ],
      }),
    )
    getMyProfileMock.mockResolvedValue(unasked())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByTestId('claim-role')).toBeNull()
  })

  // ⚠️ PENDING COUNTS. Somebody who asked yesterday and is still waiting has
  // already answered; asking again would read as the app losing their request,
  // and memberships_unique_grant would refuse the duplicate anyway.
  it('⚠️ never asks somebody whose staff request is still pending', async () => {
    useMembershipsMock.mockReturnValue(
      parentOfOne({
        memberships: [
          { role: 'parent', team_id: 't-u12', player_id: 'p1', status: 'active' },
          { role: 'manager', team_id: 't-u10', player_id: null, status: 'pending' },
        ],
      }),
    )
    getMyProfileMock.mockResolvedValue(unasked())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByTestId('claim-role')).toBeNull()
  })

  it('⚠️ never asks an admin — they plainly do a job here', async () => {
    useMembershipsMock.mockReturnValue(
      parentOfOne({ memberships: [{ role: 'admin', status: 'active', team_id: null }] }),
    )
    getMyProfileMock.mockResolvedValue(unasked())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByTestId('claim-role')).toBeNull()
  })

  it('⚠️ never asks a player-only account which squad they coach', async () => {
    useMembershipsMock.mockReturnValue(
      parentOfOne({ memberships: [{ role: 'player', team_id: 't-u12', status: 'active' }] }),
    )
    getMyProfileMock.mockResolvedValue(unasked())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByTestId('claim-role')).toBeNull()
  })

  // ⚠️ THE 16 AUG BUG, IN ITS THIRD FORM. A preview replaces the effective
  // memberships with ONE synthetic row, so an admin previewing "parent" looks
  // like somebody with no staff role. Gate on realMemberships or this fires
  // every time Jay switches.
  it('⚠️ does not open while previewing as a parent', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({
        memberships: [{ id: 'view-as', role: 'parent', team_id: 't-u12', status: 'active' }],
        realMemberships: [{ role: 'admin', status: 'active', team_id: null }],
        viewAs: { role: 'parent', teamId: 't-u12' },
      }),
    )
    getMyProfileMock.mockResolvedValue(unasked())
    renderShell()

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled())
    expect(screen.queryByTestId('claim-role')).toBeNull()
  })

  it('records "just a parent" and closes', async () => {
    useMembershipsMock.mockReturnValue(parentOfOne())
    getMyProfileMock.mockResolvedValue(unasked())
    const user = userEvent.setup()
    renderShell()

    await screen.findByTestId('no-role')
    await user.click(screen.getByTestId('no-role'))

    await waitFor(() => expect(confirmNoRoleMock).toHaveBeenCalledWith({ profileId: 'u-1' }))
    await waitFor(() => expect(screen.queryByTestId('no-role')).toBeNull())
    expect(requestStaffRoleMock).not.toHaveBeenCalled()
  })

  it('sends the squad and the role, and does NOT record "no role"', async () => {
    useMembershipsMock.mockReturnValue(parentOfOne())
    getMyProfileMock.mockResolvedValue(unasked())
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByTestId('claim-role'))
    await user.selectOptions(await screen.findByLabelText(/what do you do/i), 'coach')
    await user.selectOptions(screen.getByLabelText(/which squad/i), 't-u12')
    await user.click(screen.getByRole('button', { name: /send this to the club/i }))

    await waitFor(() => expect(requestStaffRoleMock).toHaveBeenCalledWith('t-u12', 'coach'))
    // ⚠️ THE TWO ANSWERS ARE MUTUALLY EXCLUSIVE. `no_role_confirmed_at` means
    // "I told you I have no job"; this person told us the opposite, and the
    // membership row IS the answer. Writing both would record two contradictory
    // answers to one question.
    expect(confirmNoRoleMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId('claim-role')).toBeNull())
  })

  it('refuses to send without a squad, and does not call the data layer', async () => {
    useMembershipsMock.mockReturnValue(parentOfOne())
    getMyProfileMock.mockResolvedValue(unasked())
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByTestId('claim-role'))
    await user.selectOptions(await screen.findByLabelText(/what do you do/i), 'coach')
    await user.click(screen.getByRole('button', { name: /send this to the club/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/which squad/i)
    expect(requestStaffRoleMock).not.toHaveBeenCalled()
  })

  // The squads are listed in the app's usual order, not insertion order — a
  // coach scanning for their age group should find it where every other list
  // in the app puts it.
  it('lists squads in sort_order', async () => {
    useMembershipsMock.mockReturnValue(parentOfOne())
    getMyProfileMock.mockResolvedValue(unasked())
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByTestId('claim-role'))
    const squad = await screen.findByLabelText(/which squad/i)
    const names = Array.from(squad.querySelectorAll('option')).map((option) => option.textContent)
    expect(names).toEqual(['Choose one…', 'U10 Mixed', 'U12 Mixed'])
  })

  // ⚠️ THE MOST USEFUL MOMENT THE QUESTION IS EVER PUT. Somebody who has just
  // said they have no child here is, almost by definition, here for a job.
  it('follows straight on from the no-player answer', async () => {
    useMembershipsMock.mockReturnValue(
      parentOfOne({ memberships: [{ role: 'parent', team_id: 't-u12', status: 'active' }] }),
    )
    getMyProfileMock.mockResolvedValue(unasked({ no_player_confirmed_at: null }))
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByTestId('no-player'))
    expect(await screen.findByTestId('claim-role')).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════
//  THE BIRTHDAY STEP — 17 Aug 2026
//
//  date_of_birth became required for new registrations on 16 Aug. Everybody who
//  signed up before that has none, and on 17 Aug `player_private` held ZERO
//  rows — nothing had asked them. This step asks, once, and unlike every other
//  step on this gate it CANNOT BE ANSWERED "no" (Jay's call).
//
//  ⚠️ WHICH IS WHY HALF THESE CASES ARE ABOUT NOT FIRING. A blocking sheet that
//  opens when it should not locks the club out of the app with no escape and no
//  fix short of a deploy, so "does not block" is the assertion that matters most
//  here — the opposite weighting from the skippable steps above.
// ══════════════════════════════════════════════════════════════════════════
describe('NamePrompt — the birthday step', () => {
  const PARENT = [{ role: 'parent', team_id: 't-u12', player_id: 'p-1' }]
  const BIRTHDAY_TITLE = /we need one more detail/i

  // Everything already answered EXCEPT the birthday, so each case below is
  // about that alone — the same discipline the phone and role blocks follow.
  function settledProfile(overrides = {}) {
    return unconfirmed({
      name_confirmed_at: '2026-08-01T00:00:00Z',
      phone: '+971500000000',
      no_role_confirmed_at: '2026-08-01T00:00:00Z',
      ...overrides,
    })
  }

  function asParent() {
    useMembershipsMock.mockReturnValue(loaded({ memberships: PARENT }))
    getMyProfileMock.mockResolvedValue(settledProfile())
    listPlayersMock.mockResolvedValue([{ id: 'p-1', full_name: 'Rory Aldenbrook' }])
  }

  it('asks when a linked child has no private row at all', async () => {
    asParent()
    // ⚠️ THE SHAPE PRODUCTION ACTUALLY HAS: no row, so the id is an ABSENT KEY
    // rather than a null value. A fixture returning a row with a null birthday
    // would pass a gate that only checked for nulls.
    listPlayerPrivateMock.mockResolvedValue([])
    renderShell()

    expect(await screen.findByText(BIRTHDAY_TITLE)).toBeInTheDocument()
    expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument()
  })

  // The other half of the same trap, and a real state: setPlayerDob can write a
  // row whose date_of_birth is null.
  it('asks when the row exists but the birthday is null', async () => {
    asParent()
    listPlayerPrivateMock.mockResolvedValue([{ player_id: 'p-1', date_of_birth: null }])
    renderShell()

    expect(await screen.findByText(BIRTHDAY_TITLE)).toBeInTheDocument()
  })

  it('does not ask once the birthday is on file', async () => {
    asParent()
    listPlayerPrivateMock.mockResolvedValue([{ player_id: 'p-1', date_of_birth: '2015-03-04' }])
    renderShell()

    await screen.findByText('Routed content')
    expect(screen.queryByText(BIRTHDAY_TITLE)).toBeNull()
  })

  // ⚠️ THE SAFETY CASE. Every other step fails closed on a read error and costs
  // a question; this one has no way past, so a failed read that blocked would
  // take the whole club offline.
  it('does NOT block when the birthday read fails', async () => {
    asParent()
    listPlayerPrivateMock.mockRejectedValue(new Error('network'))
    renderShell()

    await screen.findByText('Routed content')
    expect(screen.queryByText(BIRTHDAY_TITLE)).toBeNull()
  })

  // A player-only account belongs to a CHILD. Exempt for the same reason it is
  // exempt from the phone and role questions.
  it('never asks a player-only account', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [{ role: 'player', team_id: 't-u12', player_id: 'p-1' }] }),
    )
    getMyProfileMock.mockResolvedValue(settledProfile())
    listPlayerPrivateMock.mockResolvedValue([])
    renderShell()

    await screen.findByText('Routed content')
    expect(screen.queryByText(BIRTHDAY_TITLE)).toBeNull()
    // Not merely unrendered — never even asked, so no read happens either.
    expect(listPlayerPrivateMock).not.toHaveBeenCalled()
  })

  it('never asks an account with no linked child', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({ memberships: [{ role: 'coach', team_id: 't-u12' }] }),
    )
    getMyProfileMock.mockResolvedValue(settledProfile())
    renderShell()

    await screen.findByText('Routed content')
    expect(screen.queryByText(BIRTHDAY_TITLE)).toBeNull()
  })

  it('saves the birthday and closes the gate', async () => {
    const user = userEvent.setup()
    asParent()
    listPlayerPrivateMock.mockResolvedValue([])
    renderShell()

    await screen.findByText(BIRTHDAY_TITLE)
    await user.type(screen.getByTestId('dob-p-1'), '2015-03-04')
    await user.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() => expect(updatePlayerDobMock).toHaveBeenCalledWith('p-1', '2015-03-04'))
    await waitFor(() => expect(screen.queryByText(BIRTHDAY_TITLE)).toBeNull())
  })

  // ⚠️ THIS ASSERTS WHICH WRITER IS USED, AND THE TWO ARE NOT INTERCHANGEABLE.
  // setPlayerDob writes `plays_up_confirmed_at: playsUp ? now : null`, so calling
  // it here — with the flag at its default — ERASES a parent's recorded play-up
  // consent. That is right for the registration form, which asks both questions
  // together, and wrong here, where nobody is asked about consent at all.
  //
  // ⚠️ AND IT IS NOT HYPOTHETICAL FOR THIS STEP. The gate also fires on a row
  // that EXISTS with a null birthday — see the case above — which is exactly the
  // row that can already carry an agreement. Measured on production in a
  // rolled-back transaction: the old writer erased it, updatePlayerDob kept it.
  it('uses the writer that cannot erase a play-up agreement', async () => {
    const user = userEvent.setup()
    asParent()
    listPlayerPrivateMock.mockResolvedValue([])
    renderShell()

    await screen.findByText(BIRTHDAY_TITLE)
    await user.type(screen.getByTestId('dob-p-1'), '2015-03-04')
    await user.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() => expect(updatePlayerDobMock).toHaveBeenCalled())
    expect(setPlayerDobMock).not.toHaveBeenCalled()
    // Two arguments only — no options object through which the flag could travel.
    expect(updatePlayerDobMock.mock.calls[0]).toHaveLength(2)
  })

  it('refuses a blank date and names the child it wants', async () => {
    const user = userEvent.setup()
    asParent()
    listPlayerPrivateMock.mockResolvedValue([])
    renderShell()

    await screen.findByText(BIRTHDAY_TITLE)
    await user.click(screen.getByRole('button', { name: /save and continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Rory Aldenbrook/)
    expect(setPlayerDobMock).not.toHaveBeenCalled()
  })

  // ⚠️ THE ESCAPE HATCH, AND IT IS THE ONLY ONE. The sheet is dismissible={false}
  // and has no "no" answer, so without this a parent who cannot answer right now
  // has no route anywhere. AppShell: "someone who cannot get in must always be
  // able to get out."
  it('always offers a way out of the account', async () => {
    const signOut = vi.fn()
    useAuthMock.mockReturnValue({ user: { id: 'u-1', email: 'jay@example.com' }, signOut })
    asParent()
    listPlayerPrivateMock.mockResolvedValue([])
    const user = userEvent.setup()
    renderShell()

    await screen.findByText(BIRTHDAY_TITLE)
    await user.click(screen.getByTestId('birthday-sign-out'))
    expect(signOut).toHaveBeenCalled()
  })

  it('asks for every child that is missing one, and only those', async () => {
    useMembershipsMock.mockReturnValue(
      loaded({
        memberships: [
          { role: 'parent', team_id: 't-u12', player_id: 'p-1' },
          { role: 'parent', team_id: 't-u10', player_id: 'p-2' },
        ],
      }),
    )
    getMyProfileMock.mockResolvedValue(settledProfile())
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', full_name: 'Rory Aldenbrook' },
      { id: 'p-2', full_name: 'Sana Aldenbrook' },
    ])
    // One known, one not — the sibling with a birthday must not be asked for.
    listPlayerPrivateMock.mockResolvedValue([{ player_id: 'p-1', date_of_birth: '2015-03-04' }])
    renderShell()

    await screen.findByText(BIRTHDAY_TITLE)
    expect(screen.getByTestId('dob-p-2')).toBeInTheDocument()
    expect(screen.queryByTestId('dob-p-1')).toBeNull()
  })
})
