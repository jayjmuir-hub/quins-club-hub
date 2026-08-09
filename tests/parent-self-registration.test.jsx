import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Parent self-registration and the PENDING membership state — the two screens
// step 3 and step 4 of claude/decisions/2026-08-08-parent-self-registration.md
// ask for. The data layer's own tests (the exact RPC parameters, and each
// error CODE mapping to a sentence) live in tests/data.test.js alongside every
// other src/data/ function; this file is about what a person sees.
//
// Three states are exercised here and they are genuinely different people:
//
//   ZERO memberships   -> "Add your player", with "ask the club" behind it
//   ALL rows pending   -> the app, WITH their child and their fixtures, under
//                         a "waiting to be approved" banner
//   an admin           -> the approval queue on the Accounts screen
//
// ⚠️ THE MIDDLE ONE IS THE ONE THAT IS EASY TO GET WRONG, and getting it wrong
// looks like being careful. A pending member can see their own child, their
// squad's fixtures and their own availability, because RLS was changed to
// allow exactly that (db/migrations/20260808_membership_pending_status.sql).
// Hiding the app behind a "please wait" card would throw all of it away and
// reduce the pending state to a slower version of no access — which is the
// thing the whole design exists to avoid. The Schedule test below is what
// pins that down: it renders the real screen, not a placeholder.
//
// Every data module is mocked, so nothing here can reach a Supabase client.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const registerMyPlayerMock = vi.fn()
const approveMembershipMock = vi.fn()
const getMyProfileMock = vi.fn()
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()
const updateProfileNamesMock = vi.fn()
const listClubMembersMock = vi.fn()
const listPendingProfilesMock = vi.fn()
const listAccessRequestsMock = vi.fn()
const dismissAccessRequestMock = vi.fn()
const restoreAccessRequestMock = vi.fn()
const grantMembershipsMock = vi.fn()
const updateMembershipRoleMock = vi.fn()
const deleteMembershipMock = vi.fn()
const updateProfileNameMock = vi.fn()
const listPlayersMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const listAvailabilityMock = vi.fn()
const subscribeAvailabilityMock = vi.fn()
const setAvailabilityMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/members.js', () => ({
  registerMyPlayer: (...args) => registerMyPlayerMock(...args),
  approveMembership: (...args) => approveMembershipMock(...args),
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
  listClubMembers: (...args) => listClubMembersMock(...args),
  listPendingProfiles: (...args) => listPendingProfilesMock(...args),
  grantMemberships: (...args) => grantMembershipsMock(...args),
  updateMembershipRole: (...args) => updateMembershipRoleMock(...args),
  deleteMembership: (...args) => deleteMembershipMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  getMyAccessRequest: (...args) => getMyAccessRequestMock(...args),
  createAccessRequest: (...args) => createAccessRequestMock(...args),
  listAccessRequests: (...args) => listAccessRequestsMock(...args),
  dismissAccessRequest: (...args) => dismissAccessRequestMock(...args),
  restoreAccessRequest: (...args) => restoreAccessRequestMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: (...args) => subscribeAvailabilityMock(...args),
  setAvailability: (...args) => setAvailabilityMock(...args),
}))

// Imported after vi.mock so these bind to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'
import Accounts from '../src/screens/Accounts.jsx'
import Schedule from '../src/screens/Schedule.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

const CLUB_ID = 'club-1'
const TEAM_U13 = { id: 't-u13', club_id: CLUB_ID, name: 'U13', sort_order: 3 }
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 6 }
// A single-gender squad, named exactly as the club names them. Gender is
// REQUIRED on this one and on nothing else here (Jay, 9 Aug 2026).
const TEAM_U16G = { id: 't-u16g', club_id: CLUB_ID, name: 'U16G Contact', sort_order: 7 }
// Deliberately out of order: the form sorts by sort_order, like every other
// age-group list in the app.
const TEAMS = [TEAM_U16G, TEAM_U16, TEAM_U13]

function shellState(overrides = {}) {
  return {
    memberships: [],
    realMemberships: [],
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
    viewAs: null,
    setViewAs: vi.fn(),
    ...overrides,
  }
}

function renderShell(children = <div>Routed content</div>) {
  return render(
    <MemoryRouter initialEntries={['/']} future={routerFuture}>
      <AppShell>{children}</AppShell>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // useMyProfile caches at module level keyed by user id; without this the
  // first test's profile leaks into every later one.
  clearMyProfileCache()
  vi.clearAllMocks()

  useAuthMock.mockReturnValue({
    user: { id: 'user-1', email: 'hannah@example.com' },
    signOut: vi.fn(),
  })
  useMembershipsMock.mockReturnValue(shellState())
  getMyProfileMock.mockResolvedValue({
    id: 'user-1',
    full_name: 'Hannah Okafor',
    first_name: 'Hannah',
    last_name: 'Okafor',
    name_confirmed_at: '2026-08-01T00:00:00Z',
    email: 'hannah@example.com',
  })
  getMyAccessRequestMock.mockResolvedValue(null)
  registerMyPlayerMock.mockResolvedValue({
    id: 'mm-new',
    profile_id: 'user-1',
    team_id: TEAM_U13.id,
    role: 'parent',
    status: 'pending',
  })
})

describe('Add your player — a signed-in account with no access', () => {
  it('registers with the trimmed name and the chosen age group, then reloads the provider', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    useMembershipsMock.mockReturnValue(shellState({ reload }))

    renderShell()

    // Trailing spaces on purpose: a name typed on a phone keyboard picks them
    // up constantly, and the database's own guard trims before it checks for
    // blank — so the client trimming too is what keeps the two in step.
    await user.type(screen.getByLabelText(/player's full name/i), '  Chidi Okafor  ')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    // The third argument is gender, added 9 Aug 2026. NULL here on purpose:
    // "U13" is a mixed squad, the form never asked, and it must not invent an
    // answer. The single-gender squad has its own tests further down.
    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenCalledWith('Chidi Okafor', TEAM_U13.id, null),
    )
    expect(registerMyPlayerMock).toHaveBeenCalledTimes(1)

    // ⚠️ THE RELOAD IS THE HALF THAT IS INVISIBLE WHEN IT BREAKS. The
    // membership exists server-side either way; without the reload the parent
    // stays on the form looking at a screen that says nothing happened, and
    // the obvious response is to submit again — which is how somebody reaches
    // the five-pending limit without ever meaning to.
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('sorts the age groups the way every other list in the app does', async () => {
    renderShell()

    const options = within(screen.getByLabelText(/age group/i)).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Choose an age group…',
      'U13',
      'U16',
      'U16G Contact',
    ])
  })

  // ── Gender on a single-gender squad (Jay, 9 Aug 2026) ─────────────────
  //
  // ⚠️ THE RULING HAS TWO HALVES AND THEY POINT DIFFERENT WAYS. A blank gender
  // is REFUSED; a gender that CONTRADICTS the squad is ALLOWED with a warning.
  // Tests for both live here so nobody "tidies" the first into the second.
  describe('gender on a single-gender squad', () => {
    it('does not ask for gender on a mixed squad', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      // Seven of the club's eighteen squads need this. Asking the other
      // eleven's families anyway is how an optional question gets answered
      // wrongly just to get past it.
      expect(screen.queryByRole('radio', { name: /^female$/i })).not.toBeInTheDocument()
    })

    it('reveals the field as soon as a single-gender squad is chosen', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      expect(screen.getByRole('radio', { name: /^female$/i })).toBeInTheDocument()
      // Says WHY, naming the squad. A field that silently becomes mandatory
      // reads as the app malfunctioning.
      expect(screen.getByText(/U16G Contact is a single-gender squad/i)).toBeInTheDocument()
    })

    it('refuses a blank gender without spending a round trip', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's full name/i), 'Amara Bello')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/U16G Contact/i)
      // The database refuses this too (errcode 22004). The client check exists
      // so the common case does not cost a request — if this ever fires, the
      // request was never made.
      expect(registerMyPlayerMock).not.toHaveBeenCalled()
    })

    it('passes the chosen gender through as the third argument', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's full name/i), 'Amara Bello')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      await user.click(screen.getByRole('radio', { name: /^female$/i }))
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(registerMyPlayerMock).toHaveBeenCalledWith('Amara Bello', TEAM_U16G.id, 'female'),
      )
    })

    // ⚠️ THE HALF PEOPLE WILL WANT TO "FIX". A male player in U16G Contact is
    // allowed through. The club has had four women recorded in Senior Men 2nd
    // XV — a real arrangement, not a data error — and blocking it would make
    // such a player unrecordable by anyone, including whoever is trying to
    // correct them. Only ABSENCE is refused.
    it('lets a contradictory gender through rather than blocking it', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's full name/i), 'Sam Reid')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      await user.click(screen.getByRole('radio', { name: /^male$/i }))
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(registerMyPlayerMock).toHaveBeenCalledWith('Sam Reid', TEAM_U16G.id, 'male'),
      )
    })
  })

  it('will not submit a blank name, and does not spend a round trip finding out', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your player's name/i)
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
  })

  it('will not submit without an age group either', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.type(screen.getByLabelText(/player's full name/i), 'Chidi Okafor')
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose your player's age group/i)
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
  })

  // The sentence the data layer built from error.code (see
  // REGISTER_MESSAGES in src/data/members.js) has to survive the trip to the
  // screen. A component that swallowed it and printed its own generic apology
  // would make the whole code-keyed mapping pointless.
  it('shows the refusal the data layer produced, and lets them try again', async () => {
    const user = userEvent.setup()
    const refusal = new Error(
      'Please confirm your email address before adding a player. Check your inbox.',
    )
    refusal.code = '42501'
    registerMyPlayerMock.mockRejectedValue(refusal)

    renderShell()

    await user.type(screen.getByLabelText(/player's full name/i), 'Chidi Okafor')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/confirm your email address/i)
    // Re-enabled, not stuck in "Adding…": the fix for an unconfirmed email is
    // to go and click a link and come back, and the form has to still work.
    expect(screen.getByRole('button', { name: /add my player/i })).toBeEnabled()
  })

  // ⚠️ THIS IS A REAL PRODUCTION STATE, NOT A DEFENSIVE BRANCH. `team read`
  // is "EXISTS a membership row for auth.uid() in this club", so a person with
  // ZERO memberships reads ZERO teams — which is exactly the person this
  // screen is for. Until that policy is widened (see
  // db/migrations/20260808_teams_readable_before_registration.sql, written but
  // NOT applied) this is what every self-registering parent will actually see,
  // and it has to be honest and offer a way forward rather than rendering an
  // empty dropdown.
  it('says so, and offers the other route, when no age groups came back', async () => {
    useMembershipsMock.mockReturnValue(shellState({ teams: [] }))

    renderShell()

    expect(await screen.findByText(/couldn't load the club's age groups/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/age group/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not adding a player/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('keeps the ask-the-club route for someone with no child to register', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: /not adding a player/i }))

    // RequestAccess, unchanged — a coach or committee member still gets the
    // route that existed before self-registration.
    expect(await screen.findByRole('button', { name: /request access/i })).toBeInTheDocument()
    expect(screen.getByText('hannah@example.com')).toBeInTheDocument()
  })
})

describe('A member waiting to be approved', () => {
  const PENDING_MEMBERSHIP = {
    id: 'mm-pending',
    profile_id: 'user-1',
    club_id: CLUB_ID,
    team_id: TEAM_U13.id,
    role: 'parent',
    player_id: 'p-chidi',
    status: 'pending',
    teams: TEAM_U13,
  }

  it('sees the waiting banner ABOVE the app, not instead of it', async () => {
    useMembershipsMock.mockReturnValue(shellState({ memberships: [PENDING_MEMBERSHIP] }))

    renderShell()

    expect(await screen.findByTestId('pending-approval')).toHaveTextContent(
      /waiting to be approved/i,
    )
    expect(screen.getByText('Routed content')).toBeInTheDocument()
  })

  // ⚠️ THE ONE THAT PROVES THE POINT. The real Schedule screen, rendered
  // inside the real AppShell, for somebody whose only membership is pending.
  // `event read` is private.is_attached_to_team, which accepts any status, so
  // the database really does return these fixtures — and if the app ever
  // starts gating on approval, this test is what says so.
  it('still sees the squad’s fixtures', async () => {
    listEventsMock.mockResolvedValue([
      {
        id: 'e-1',
        team_id: TEAM_U13.id,
        title: 'Training',
        kind: 'training',
        starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Zayed Sports City',
      },
    ])
    subscribeEventsMock.mockReturnValue(() => {})
    listAvailabilityMock.mockResolvedValue([])
    subscribeAvailabilityMock.mockReturnValue(() => {})
    listPlayersMock.mockResolvedValue([])
    useMembershipsMock.mockReturnValue(shellState({ memberships: [PENDING_MEMBERSHIP] }))

    renderShell(<Schedule />)

    expect(await screen.findByText(/training/i)).toBeInTheDocument()
    expect(screen.getByTestId('pending-approval')).toBeInTheDocument()
  })

  // A parent who already has one approved squad and has just registered a
  // second child is a fully working member. Banner-ing their whole app would
  // be wrong, which is why isPendingOnly is `every` and not `some`.
  it('is not shown to someone who has one approved squad and one pending', async () => {
    useMembershipsMock.mockReturnValue(
      shellState({
        memberships: [
          { ...PENDING_MEMBERSHIP, id: 'mm-active', team_id: TEAM_U16.id, status: 'active' },
          PENDING_MEMBERSHIP,
        ],
      }),
    )

    renderShell()

    expect(await screen.findByText('Routed content')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-approval')).not.toBeInTheDocument()
  })

  it('is not shown to somebody with no memberships at all', async () => {
    renderShell()

    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
    expect(screen.queryByTestId('pending-approval')).not.toBeInTheDocument()
  })
})

describe('Accounts — the approval queue', () => {
  const ADMIN = [{ id: 'm-admin', role: 'admin', team_id: null, club_id: CLUB_ID }]

  const JAY_ADMIN = {
    id: 'mem-jay',
    profile_id: 'profile-jay',
    role: 'admin',
    team_id: null,
    status: 'active',
    created_at: '2026-01-05T09:00:00Z',
    profiles: { full_name: 'Jay Muir', email: 'jay@example.com' },
    teams: null,
  }
  // The self-registered row. Note it carries a linked player and a real
  // profile — that is what distinguishes it from a "waiting for access"
  // stranger, and it is why the card leads with the CHILD's name.
  const HANNAH_PENDING = {
    id: 'mem-hannah',
    profile_id: 'profile-hannah',
    role: 'parent',
    team_id: TEAM_U13.id,
    player_id: 'p-chidi',
    status: 'pending',
    created_at: '2026-08-08T07:15:00Z',
    profiles: { full_name: 'Hannah Okafor', email: 'hannah@example.com' },
    teams: { name: 'U13' },
    players: { full_name: 'Chidi Okafor' },
  }

  function renderAccounts() {
    return render(<Accounts />)
  }

  beforeEach(() => {
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: TEAMS })
    useAuthMock.mockReturnValue({ user: { id: 'profile-jay' }, signOut: vi.fn() })
    listClubMembersMock.mockResolvedValue([JAY_ADMIN, HANNAH_PENDING])
    listPendingProfilesMock.mockResolvedValue([])
    listAccessRequestsMock.mockResolvedValue([])
    listPlayersMock.mockResolvedValue([])
    approveMembershipMock.mockResolvedValue({ id: HANNAH_PENDING.id, status: 'active' })
  })

  it('lists a pending registration in its own section, child first', async () => {
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    const card = within(queue).getByTestId('pending-membership')
    expect(within(card).getByText(/chidi okafor/i)).toBeInTheDocument()
    expect(within(card).getByText(/added by hannah okafor/i)).toBeInTheDocument()
    expect(within(card).getByText('U13')).toBeInTheDocument()
  })

  // ⚠️ THE THIRD CATEGORY. A pending person is neither "has access" nor
  // "asked for access", and putting them in either list misleads an admin:
  // the main list would put them under a Revoke button while telling them
  // that somebody who can see nothing has access.
  it('keeps them out of the main list and out of the waiting-for-access list', async () => {
    renderAccounts()

    await screen.findByTestId('pending-approvals')

    // One block, Jay's. Hannah has no ACTIVE row, so she has no block.
    const blocks = screen.getAllByTestId('account-person')
    expect(blocks).toHaveLength(1)
    expect(within(blocks[0]).getByTestId('account-name')).toHaveTextContent('Jay Muir')

    // And she is not in the other queue either — that one is driven by
    // access_requests and by profiles with NO membership, and she has one.
    expect(
      within(screen.getByTestId('waiting-for-access')).queryByText(/hannah/i),
    ).not.toBeInTheDocument()
  })

  it('counts her as a login, but not as somebody with access', async () => {
    renderAccounts()

    await screen.findByTestId('pending-approvals')
    // 1 with access (Jay) · 1 access row (his) · 2 logins (both of them).
    expect(screen.getByText(/1 with access/)).toHaveTextContent(
      '1 with access · 1 access row · 2 logins',
    )
  })

  it('approves, and the row moves into the main list on the same render', async () => {
    const user = userEvent.setup()
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

    await waitFor(() => expect(approveMembershipMock).toHaveBeenCalledWith(HANNAH_PENDING.id))

    // The queue is gone (it was the only row in it) and Hannah now has a block
    // of her own in the main list, with the revoke control every other member
    // has. That transition is the whole feature: nothing was refetched, the
    // row simply stopped being pending.
    await waitFor(() => expect(screen.queryByTestId('pending-approvals')).not.toBeInTheDocument())
    const blocks = screen.getAllByTestId('account-person')
    expect(blocks).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: /revoke access for hannah okafor/i }),
    ).toBeInTheDocument()
  })

  // The refusal now comes from the RPC, which RAISES rather than matching zero
  // rows — see approveMembership in src/data/members.js. Its sentence is passed
  // through untouched, so this asserts the row STAYS rather than the wording.
  it('leaves the row in the queue when the approval is refused', async () => {
    const user = userEvent.setup()
    approveMembershipMock.mockRejectedValue(
      new Error('You can only approve players for your own age groups.'),
    )
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/your own age groups/i)
    expect(screen.getByTestId('pending-membership')).toBeInTheDocument()
  })

  it('shows no queue at all when nobody is waiting', async () => {
    listClubMembersMock.mockResolvedValue([JAY_ADMIN])
    renderAccounts()

    await screen.findByTestId('waiting-for-access')
    expect(screen.queryByTestId('pending-approvals')).not.toBeInTheDocument()
  })

  // ── The coach / team manager view (Jay, 9 Aug 2026) ──────────────────
  //
  // ⚠️ WHAT THE SCREEN OFFERS IS NOT THE BOUNDARY. private.can_approve_team is,
  // and db/tests/rls-squad-staff-approval.sql proves it live — including that a
  // parent cannot approve themselves. These tests are about what a coach SEES:
  // the queue and nothing else, and no misleading numbers.
  describe('for a coach or team manager', () => {
    const COACH_U13 = [
      { id: 'mem-coach', role: 'coach', team_id: TEAM_U13.id, club_id: CLUB_ID, status: 'active' },
    ]
    const MANAGER_U13 = [
      { id: 'mem-mgr', role: 'manager', team_id: TEAM_U13.id, club_id: CLUB_ID, status: 'active' },
    ]

    it('shows a coach the queue and lets them approve', async () => {
      const user = userEvent.setup()
      useMembershipsMock.mockReturnValue({ memberships: COACH_U13, teams: TEAMS })
      // The database hands a coach only their own squads' pending rows — the
      // admin's own membership is not among them.
      listClubMembersMock.mockResolvedValue([HANNAH_PENDING])
      renderAccounts()

      const queue = await screen.findByTestId('pending-approvals')
      await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

      await waitFor(() => expect(approveMembershipMock).toHaveBeenCalledWith(HANNAH_PENDING.id))
    })

    it('shows a team manager the same thing', async () => {
      useMembershipsMock.mockReturnValue({ memberships: MANAGER_U13, teams: TEAMS })
      listClubMembersMock.mockResolvedValue([HANNAH_PENDING])
      renderAccounts()

      expect(await screen.findByTestId('pending-approvals')).toBeInTheDocument()
    })

    // ⚠️ MEDIC IS DELIBERATELY EXCLUDED. can_edit_team includes medic — they
    // may edit players on the squad, which is the point of the role — but
    // admitting a stranger to a children's squad is not a medical decision.
    it('refuses a medic, though a medic may edit that very squad', async () => {
      useMembershipsMock.mockReturnValue({
        memberships: [{ id: 'mem-medic', role: 'medic', team_id: TEAM_U13.id, club_id: CLUB_ID }],
        teams: TEAMS,
      })
      renderAccounts()

      expect(await screen.findByRole('alert')).toHaveTextContent(/not authorised/i)
    })

    it('refuses a parent of a child in that very squad', async () => {
      // The case that would make the whole pending design theatre.
      useMembershipsMock.mockReturnValue({
        memberships: [
          { id: 'mem-p', role: 'parent', team_id: TEAM_U13.id, player_id: 'p-x', club_id: CLUB_ID },
        ],
        teams: TEAMS,
      })
      renderAccounts()

      expect(await screen.findByRole('alert')).toHaveTextContent(/not authorised/i)
    })

    it('tells a coach with an empty queue that it is empty, rather than showing nothing', async () => {
      useMembershipsMock.mockReturnValue({ memberships: COACH_U13, teams: TEAMS })
      listClubMembersMock.mockResolvedValue([])
      renderAccounts()

      // A blank screen reads as broken. The empty state says what will appear
      // here and when.
      expect(await screen.findByText(/when a parent registers a player/i)).toBeInTheDocument()
    })
  })
})
