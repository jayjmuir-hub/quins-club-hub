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
// Deliberately out of order: the form sorts by sort_order, like every other
// age-group list in the app.
const TEAMS = [TEAM_U16, TEAM_U13]

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

    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenCalledWith('Chidi Okafor', TEAM_U13.id),
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
    ])
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

  // ⚠️ A COACH CANNOT APPROVE. `memb manage` is private.is_admin(club_id),
  // with no coach clause, so a coach's UPDATE matches zero rows and PostgREST
  // reports that as a success — which is why approveMembership reads the row
  // back and throws. The screen has to show that refusal rather than moving
  // the card as though it had worked. (A coach cannot reach this screen at all
  // today; this is about the message being right if the gate is ever widened
  // before the policy is.)
  it('leaves the row in the queue when the write is refused', async () => {
    const user = userEvent.setup()
    approveMembershipMock.mockRejectedValue(
      new Error("We couldn't approve that person. Only a club admin can approve access."),
    )
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/only a club admin/i)
    expect(screen.getByTestId('pending-membership')).toBeInTheDocument()
  })

  it('shows no queue at all when nobody is waiting', async () => {
    listClubMembersMock.mockResolvedValue([JAY_ADMIN])
    renderAccounts()

    await screen.findByTestId('waiting-for-access')
    expect(screen.queryByTestId('pending-approvals')).not.toBeInTheDocument()
  })
})
