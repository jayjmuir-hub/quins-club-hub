import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Accounts.jsx (design spec 2026-08-03 §2).
// useMemberships, useAuth and src/data/members.js are all mocked, following
// tests/admin.test.jsx's style, so this exercises only the screen's own
// behaviour: the admin gate, grouping by person, the role/age-group writes,
// the last-admin guard and the revoke confirmation. No network is reachable
// from this file.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listClubMembersMock = vi.fn()
const listPendingProfilesMock = vi.fn()
const grantMembershipMock = vi.fn()
const updateMembershipRoleMock = vi.fn()
const deleteMembershipMock = vi.fn()
const updateProfileNameMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/data/members.js', () => ({
  listClubMembers: (...args) => listClubMembersMock(...args),
  listPendingProfiles: (...args) => listPendingProfilesMock(...args),
  grantMembership: (...args) => grantMembershipMock(...args),
  updateMembershipRole: (...args) => updateMembershipRoleMock(...args),
  deleteMembership: (...args) => deleteMembershipMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Accounts from '../src/screens/Accounts.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12 Boys', sort_order: 6 }
const TEAMS = [TEAM_U12, TEAM_U10] // deliberately unsorted; the screen sorts

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null, club_id: CLUB_ID }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

const SELF_ID = 'profile-jay'

// Jay (the signed-in admin) plus two others. Sara holds TWO membership rows —
// memberships has no unique constraint, so this is legitimate data and the
// screen must group it into one block rather than printing her name twice.
const JAY_ADMIN = {
  id: 'mem-jay',
  profile_id: SELF_ID,
  role: 'admin',
  team_id: null,
  created_at: '2026-01-05T09:00:00Z',
  profiles: { full_name: 'Jay Muir', email: 'jay@example.com' },
  teams: null,
}
const SARA_COACH = {
  id: 'mem-sara-coach',
  profile_id: 'profile-sara',
  role: 'coach',
  team_id: 'team-u10',
  created_at: '2026-02-01T09:00:00Z',
  profiles: { full_name: 'Sara Coach', email: 'sara@example.com' },
  teams: { name: 'U10' },
}
const SARA_PARENT = {
  id: 'mem-sara-parent',
  profile_id: 'profile-sara',
  role: 'parent',
  team_id: 'team-u12',
  created_at: '2026-02-02T09:00:00Z',
  profiles: { full_name: 'Sara Coach', email: 'sara@example.com' },
  teams: { name: 'U12 Boys' },
}
// The only row here with a linked player. memberships.player_id is null for
// admin and coach rows by design (there is no player to point at), so this
// fixture set deliberately mixes the two: Ali's parent row carries a child,
// Jay's admin and Sara's coach/parent rows do not.
const ALI_PARENT = {
  id: 'mem-ali',
  profile_id: 'profile-ali',
  role: 'parent',
  team_id: 'team-u12',
  player_id: 'player-omar',
  created_at: '2026-03-01T09:00:00Z',
  profiles: { full_name: 'Ali Parent', email: 'ali@example.com' },
  teams: { name: 'U12 Boys' },
  players: { full_name: 'Omar Ali' },
}

const MEMBER_ROWS = [JAY_ADMIN, SARA_COACH, SARA_PARENT, ALI_PARENT]

// What listPendingProfiles ACTUALLY returns for an admin: their own profile,
// every profile with a membership in their club, AND the genuinely unattached
// signups — the union of three RLS policies, not a pending list. Only the last
// two rows here are waiting for access. Any test fixture that returns only the
// unattached rows would hide the exact bug this screen has to avoid.
const JANICE_PENDING = {
  id: 'profile-janice',
  full_name: '',
  email: 'janice@example.com',
  created_at: '2026-08-03T11:37:00Z',
}
const RAW_PENDING = {
  id: 'profile-raw',
  full_name: 'Raw Recruit',
  email: 'raw@example.com',
  created_at: '2026-08-02T08:00:00Z',
}
const PROFILE_ROWS = [
  JANICE_PENDING,
  RAW_PENDING,
  { id: SELF_ID, full_name: 'Jay Muir', email: 'jay@example.com', created_at: '2026-01-05T09:00:00Z' },
  { id: 'profile-sara', full_name: 'Sara Coach', email: 'sara@example.com', created_at: '2026-02-01T09:00:00Z' },
  { id: 'profile-ali', full_name: 'Ali Parent', email: 'ali@example.com', created_at: '2026-03-01T09:00:00Z' },
]

function memberships(rows, teams = TEAMS) {
  return {
    memberships: rows,
    realMemberships: rows,
    viewAs: null,
    setViewAs: vi.fn(),
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  useAuthMock.mockReturnValue({ user: { id: SELF_ID, email: 'jay@example.com' } })
  listClubMembersMock.mockResolvedValue(MEMBER_ROWS)
  listPendingProfilesMock.mockResolvedValue(PROFILE_ROWS)
  grantMembershipMock.mockImplementation(async ({ profileId, clubId, role, teamId }) => ({
    id: `mem-new-${profileId}`,
    profile_id: profileId,
    club_id: clubId,
    role,
    team_id: role === 'admin' ? null : teamId,
    player_id: null,
    created_at: '2026-08-03T12:00:00Z',
  }))
  updateMembershipRoleMock.mockImplementation(async ({ membershipId, role, teamId }) => ({
    id: membershipId,
    role,
    team_id: role === 'admin' ? null : teamId,
  }))
  deleteMembershipMock.mockResolvedValue(undefined)
  updateProfileNameMock.mockImplementation(async ({ fullName }) => ({ full_name: fullName.trim() }))
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Accounts />)
  return { user, ...utils }
}

// Finds the rendered membership row whose role/age-group controls carry the
// given accessible-name fragment. Rows are keyed by "<name> (<team or
// club-wide>)", which is what makes one person's two rows addressable.
function roleSelect(label) {
  return screen.getByLabelText(`Role for ${label}`)
}

describe('Accounts — authorisation gate', () => {
  it('renders the screen for an admin', async () => {
    setup()

    expect(await screen.findByRole('heading', { name: /accounts/i })).toBeInTheDocument()
  })

  it('renders a not-authorised message for a coach, and issues no query', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(listClubMembersMock).not.toHaveBeenCalled()
  })

  it('renders a not-authorised message for a parent, and issues no query', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(listClubMembersMock).not.toHaveBeenCalled()
  })

  // The view-as preview (spec §1) swaps the EFFECTIVE membership set for a
  // synthetic coach/parent row while realMemberships still says admin.
  // Accounts gates on the effective set on purpose, so previewing hides it.
  it('hides itself while a real admin previews as a coach', async () => {
    useMembershipsMock.mockReturnValue({
      ...memberships(ADMIN),
      memberships: [{ id: 'view-as', role: 'coach', team_id: 'team-u10', player_id: null }],
      viewAs: { role: 'coach', teamId: 'team-u10' },
    })

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(listClubMembersMock).not.toHaveBeenCalled()
  })
})

describe('Accounts — list', () => {
  it('renders each person with their name, email, role and age group', async () => {
    setup()

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    expect(screen.getByText('sara@example.com')).toBeInTheDocument()
    expect(screen.getByText('Ali Parent')).toBeInTheDocument()
    expect(screen.getByText('ali@example.com')).toBeInTheDocument()

    // Age group is an editable select holding the member's current team.
    expect(roleSelect('Ali Parent (U12 Boys)')).toHaveValue('parent')
    expect(screen.getByLabelText('Age group for Ali Parent (U12 Boys)')).toHaveValue('team-u12')
  })

  // Task 5: the "Linked player" column the spec's column list asks for
  // (Name · Email · Role · Age group · Linked player · Joined). It is fed by
  // listClubMembers' players(full_name) embed.
  it('shows the linked player’s name, and a placeholder when there is none', async () => {
    setup()

    await screen.findByText('Sara Coach')

    const aliRow = screen
      .getAllByTestId('account-membership')
      .find((row) => within(row).queryByLabelText('Role for Ali Parent (U12 Boys)'))
    expect(within(aliRow).getByTestId('account-linked-player')).toHaveTextContent('Omar Ali')

    // An admin row has no player to link to — that is normal, so it reads as
    // an em dash rather than anything that looks like missing data.
    const jayRow = screen
      .getAllByTestId('account-membership')
      .find((row) => within(row).queryByLabelText('Role for Jay Muir (club-wide)'))
    expect(within(jayRow).getByTestId('account-linked-player')).toHaveTextContent('—')
    expect(within(jayRow).getByText('No linked player')).toBeInTheDocument()
  })

  it('falls back to "Unknown player" when a linked row has no embedded name', async () => {
    // player_id set but the embed empty: not reachable for an admin under the
    // current policies, but a partial join or a deleted player would produce
    // it, and showing the raw uuid instead would mean nothing to anyone.
    listClubMembersMock.mockResolvedValue([{ ...ALI_PARENT, players: null }])
    setup()

    await screen.findByText('Ali Parent')
    expect(screen.getByTestId('account-linked-player')).toHaveTextContent('Unknown player')
  })

  it('groups a person with several membership rows into one block', async () => {
    setup()

    await screen.findByText('Sara Coach')

    // Three people, four membership rows.
    expect(screen.getAllByTestId('account-person')).toHaveLength(3)
    expect(screen.getAllByTestId('account-membership')).toHaveLength(4)
    // Sara's name appears once, not once per row.
    expect(screen.getAllByText('Sara Coach')).toHaveLength(1)

    const saraBlock = screen
      .getAllByTestId('account-person')
      .find((block) => within(block).queryByText('Sara Coach'))
    expect(within(saraBlock).getAllByTestId('account-membership')).toHaveLength(2)
    expect(within(saraBlock).getByText(/2 access rows/i)).toBeInTheDocument()
  })

  it('shows the email as plain text, with a note that passwords are self-serve', async () => {
    setup()

    await screen.findByText('Sara Coach')

    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument()
    expect(screen.getByText(/passwords are self-serve/i)).toBeInTheDocument()
  })

  it('shows a loading state, then an error with a retry', async () => {
    listClubMembersMock.mockReturnValue(new Promise(() => {}))
    const { unmount } = setup()
    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
    unmount()

    listClubMembersMock.mockRejectedValue(new Error('Network unreachable'))
    const { user } = setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/network unreachable/i)).toBeInTheDocument()

    listClubMembersMock.mockResolvedValue(MEMBER_ROWS)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
  })
})

describe('Accounts — changing access', () => {
  it('changes a role with the membership id, new role and current team', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(roleSelect('Ali Parent (U12 Boys)'), 'coach')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-ali',
      role: 'coach',
      teamId: 'team-u12',
    })
  })

  it('reassigns an age group without changing the role', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(screen.getByLabelText('Age group for Ali Parent (U12 Boys)'), 'team-u10')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-ali',
      role: 'parent',
      teamId: 'team-u10',
    })
  })

  it('promoting to admin drops the age group and shows "All age groups"', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(roleSelect('Ali Parent (U12 Boys)'), 'admin')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-ali',
      role: 'admin',
      teamId: 'team-u12',
    })
    // The data layer coerces team_id to null for an admin row and returns it;
    // the screen must render that, not the stale U12 selection.
    const aliRow = await screen.findByLabelText('Role for Ali Parent (club-wide)')
    expect(aliRow).toHaveValue('admin')
    expect(screen.queryByLabelText('Age group for Ali Parent (club-wide)')).not.toBeInTheDocument()
  })

  it('reports a refused write inline on the row', async () => {
    updateMembershipRoleMock.mockRejectedValue(new Error('Choose an age group for this role.'))

    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(roleSelect('Ali Parent (U12 Boys)'), 'coach')

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an age group/i)
  })

  it('edits a display name once for a person with several rows', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByRole('button', { name: /edit name for sara coach/i }))
    const input = screen.getByLabelText('Display name for Sara Coach')
    await user.clear(input)
    await user.type(input, 'Sara Hughes')
    await user.click(screen.getByRole('button', { name: /save name/i }))

    expect(updateProfileNameMock).toHaveBeenCalledWith({
      profileId: 'profile-sara',
      fullName: 'Sara Hughes',
    })
    expect(await screen.findByText('Sara Hughes')).toBeInTheDocument()
    // Still one person, still two rows — the rename didn't split the block.
    expect(screen.getAllByTestId('account-person')).toHaveLength(3)
  })
})

describe('Accounts — revoking access', () => {
  it('asks for confirmation before deleting, and does nothing if cancelled', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByLabelText('Revoke access for Ali Parent (U12 Boys)'))

    expect(screen.getByText(/remove this access\?/i)).toBeInTheDocument()
    expect(deleteMembershipMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(deleteMembershipMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/remove this access\?/i)).not.toBeInTheDocument()
  })

  it('deletes the membership once confirmed and removes it from the list', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByLabelText('Revoke access for Ali Parent (U12 Boys)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke ali parent/i }))

    expect(deleteMembershipMock).toHaveBeenCalledWith('mem-ali')
    expect(await screen.findByText(/2 people/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('account-person')).toHaveLength(2)

    // He was holding his ONLY membership, so revoking it leaves him with a
    // login and no access — which is exactly what "Waiting for access" means.
    // He therefore moves into that section rather than vanishing (a reload
    // would show the same thing). Not a bug: the alternative is an account
    // that exists and is listed nowhere, which is the problem Task B fixed.
    expect(
      within(screen.getByTestId('waiting-for-access')).getByText('Ali Parent'),
    ).toBeInTheDocument()
  })

  it('removes only the confirmed row of a person who holds several', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByLabelText('Revoke access for Sara Coach (U10)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke sara coach/i }))

    expect(deleteMembershipMock).toHaveBeenCalledWith('mem-sara-coach')
    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    expect(screen.getAllByTestId('account-membership')).toHaveLength(3)
  })
})

describe('Accounts — last-admin guard', () => {
  it('refuses to revoke the signed-in admin’s only admin row, without calling the data layer', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByLabelText('Revoke access for Jay Muir (club-wide)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke jay muir/i }))

    expect(deleteMembershipMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/locked out/i)
    expect(screen.getByText('Jay Muir')).toBeInTheDocument()
  })

  it('refuses to demote the signed-in admin’s only admin row', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(roleSelect('Jay Muir (club-wide)'), 'coach')

    expect(updateMembershipRoleMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/locked out/i)
    expect(roleSelect('Jay Muir (club-wide)')).toHaveValue('admin')
  })

  it('allows demoting one of the signed-in admin’s two admin rows', async () => {
    listClubMembersMock.mockResolvedValue([
      ...MEMBER_ROWS,
      { ...JAY_ADMIN, id: 'mem-jay-dup', created_at: '2026-01-06T09:00:00Z' },
    ])

    const { user } = setup()

    await screen.findByText('Sara Coach')
    const jayRows = screen.getAllByLabelText('Role for Jay Muir (club-wide)')
    expect(jayRows).toHaveLength(2)

    await user.selectOptions(jayRows[1], 'coach')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-jay-dup',
      role: 'coach',
      teamId: null,
    })
  })

  it('does not block removing someone else’s admin row', async () => {
    listClubMembersMock.mockResolvedValue([
      JAY_ADMIN,
      { ...ALI_PARENT, role: 'admin', team_id: null, teams: null },
    ])

    const { user } = setup()

    await screen.findByText('Ali Parent')
    await user.click(screen.getByLabelText('Revoke access for Ali Parent (club-wide)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke ali parent/i }))

    expect(deleteMembershipMock).toHaveBeenCalledWith('mem-ali')
  })
})

// Task B (plan 2026-08-03 §Task B). Signing up creates a profile but no
// membership, so these people are invisible everywhere else on this screen.
describe('Accounts — waiting for access', () => {
  function waitingSection() {
    return screen.getByTestId('waiting-for-access')
  }

  // The single most important test in this file. listPendingProfiles returns
  // EVERY profile the admin can read — their own, every member of their club,
  // and the unattached signups — so the screen has to subtract the profile ids
  // already in the member list. Skip that and every existing member is shown
  // as if they had no access.
  it('lists only the profiles with no membership, never existing members', async () => {
    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).getAllByTestId('waiting-person')).toHaveLength(2)
    expect(within(section).getByText(/janice@example\.com/)).toBeInTheDocument()
    expect(within(section).getByText('Raw Recruit')).toBeInTheDocument()

    // Members, and the signed-in admin, are all in the readable profile list
    // and must NOT be here.
    expect(within(section).queryByText('Sara Coach')).not.toBeInTheDocument()
    expect(within(section).queryByText(/sara@example\.com/)).not.toBeInTheDocument()
    expect(within(section).queryByText('Ali Parent')).not.toBeInTheDocument()
    expect(within(section).queryByText(/ali@example\.com/)).not.toBeInTheDocument()
    expect(within(section).queryByText('Jay Muir')).not.toBeInTheDocument()
    expect(within(section).queryByText(/jay@example\.com/)).not.toBeInTheDocument()
  })

  it('shows the signup date, a blank-name fallback, and explains what the list is', async () => {
    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).getByRole('heading', { name: /waiting for access/i })).toBeInTheDocument()
    expect(within(section).getByText(/see nothing at all in the app/i)).toBeInTheDocument()
    // Not "requests" — nobody asked for anything.
    expect(within(section).queryByText(/request/i)).not.toBeInTheDocument()
    expect(within(section).getByText('No name yet')).toBeInTheDocument()
    expect(within(section).getByText(/signed up 3 Aug 2026/)).toBeInTheDocument()
  })

  it('offers no reject or dismiss control, and says why', async () => {
    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).queryByRole('button', { name: /dismiss|reject|decline|ignore/i })).toBeNull()
    expect(within(section).getByText(/nothing to turn down/i)).toBeInTheDocument()
  })

  it('renders an empty state, not a bare heading, when nobody is waiting', async () => {
    // Only members and the admin readable — the normal steady state.
    listPendingProfilesMock.mockResolvedValue(PROFILE_ROWS.filter((row) => row.id.startsWith('profile-') && row.id !== 'profile-janice' && row.id !== 'profile-raw'))

    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).queryAllByTestId('waiting-person')).toHaveLength(0)
    expect(within(section).getByText(/nobody is waiting for access/i)).toBeInTheDocument()
  })

  it('grants access with the club, role and age group, and moves the person into the list', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(screen.getByLabelText('Role for raw@example.com'), 'coach')
    await user.selectOptions(screen.getByLabelText('Age group for raw@example.com'), 'team-u10')
    await user.click(screen.getByRole('button', { name: /give access to raw@example\.com/i }))

    expect(grantMembershipMock).toHaveBeenCalledWith({
      profileId: 'profile-raw',
      clubId: CLUB_ID,
      role: 'coach',
      teamId: 'team-u10',
    })

    // Moved, not duplicated: gone from the waiting list, present in the main
    // one, with no reload.
    expect(await screen.findByLabelText('Role for Raw Recruit (U10)')).toHaveValue('coach')
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(1)
    expect(screen.getAllByTestId('account-person')).toHaveLength(4)
    expect(listClubMembersMock).toHaveBeenCalledTimes(1)
  })

  it('grants an admin with no age group control at all', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(screen.getByLabelText('Role for raw@example.com'), 'admin')

    expect(screen.queryByLabelText('Age group for raw@example.com')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /give access to raw@example\.com/i }))

    expect(grantMembershipMock).toHaveBeenCalledWith({
      profileId: 'profile-raw',
      clubId: CLUB_ID,
      role: 'admin',
      teamId: null,
    })
    expect(await screen.findByLabelText('Role for Raw Recruit (club-wide)')).toHaveValue('admin')
  })

  it('refuses to grant without a role, before any network call', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.click(screen.getByRole('button', { name: /give access to raw@example\.com/i }))

    expect(grantMembershipMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a role/i)
  })

  it('refuses a non-admin grant without an age group, before any network call', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(screen.getByLabelText('Role for raw@example.com'), 'parent')
    await user.click(screen.getByRole('button', { name: /give access to raw@example\.com/i }))

    expect(grantMembershipMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/choose an age group/i)
  })

  it('reports a refused grant inline and keeps the person on the list', async () => {
    grantMembershipMock.mockRejectedValue(
      new Error("We couldn't give that person access. You may not have permission to manage members."),
    )

    const { user } = setup()

    await screen.findByText('Sara Coach')
    await user.selectOptions(screen.getByLabelText('Role for raw@example.com'), 'coach')
    await user.selectOptions(screen.getByLabelText('Age group for raw@example.com'), 'team-u10')
    await user.click(screen.getByRole('button', { name: /give access to raw@example\.com/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/may not have permission/i)
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(2)
  })

  // Without the member list there is nothing to subtract against, so showing
  // the section would show every member as waiting.
  it('hides the section entirely when the member list failed to load', async () => {
    listClubMembersMock.mockRejectedValue(new Error('Network unreachable'))

    setup()

    await screen.findByText(/network unreachable/i)
    expect(screen.queryByTestId('waiting-for-access')).not.toBeInTheDocument()
  })

  // The reverse failure is survivable: the accounts an admin came to manage
  // still render, and the section honestly shows nobody.
  it('still renders the accounts when the profile read failed', async () => {
    listPendingProfilesMock.mockRejectedValue(new Error('permission denied'))

    setup()

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    expect(within(waitingSection()).getByText(/nobody is waiting for access/i)).toBeInTheDocument()
  })

  it('issues no profile query for a non-admin', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()

    expect(listPendingProfilesMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('waiting-for-access')).not.toBeInTheDocument()
  })
})
