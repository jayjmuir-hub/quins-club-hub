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
  updateMembershipRole: (...args) => updateMembershipRoleMock(...args),
  deleteMembership: (...args) => deleteMembershipMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Accounts from '../src/screens/Accounts.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12 Boys', sort_order: 6 }
const TEAMS = [TEAM_U12, TEAM_U10] // deliberately unsorted; the screen sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
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
const ALI_PARENT = {
  id: 'mem-ali',
  profile_id: 'profile-ali',
  role: 'parent',
  team_id: 'team-u12',
  created_at: '2026-03-01T09:00:00Z',
  profiles: { full_name: 'Ali Parent', email: 'ali@example.com' },
  teams: { name: 'U12 Boys' },
}

const MEMBER_ROWS = [JAY_ADMIN, SARA_COACH, SARA_PARENT, ALI_PARENT]

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
    expect(screen.queryByText('Ali Parent')).not.toBeInTheDocument()
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
