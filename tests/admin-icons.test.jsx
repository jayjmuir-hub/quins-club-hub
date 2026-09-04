import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// /admin/icons — the grant screen (claude/plans/2026-08-31-profile-icons.md).
// Super admins pin recognition emoji to a squad's staff or a person. The
// check here is a "not your job" message; profile_icons' RLS actually
// decides (db/tests/profile-icons.sql). ⚠️ NAMES INVENTED — rule 9.

const useMembershipsMock = vi.fn()
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))

const m = {
  listIconGrants: vi.fn(),
  grantIcon: vi.fn(),
  revokeIcon: vi.fn(),
  setPrimaryIcon: vi.fn(),
}
vi.mock('../src/data/profileIcons.js', () => ({
  listIconGrants: (...a) => m.listIconGrants(...a),
  grantIcon: (...a) => m.grantIcon(...a),
  revokeIcon: (...a) => m.revokeIcon(...a),
  setPrimaryIcon: (...a) => m.setPrimaryIcon(...a),
  listClubIconMap: async () => new Map(),
  listMemberIcons: async () => [],
  // The role groups are data, not network — the real list, so the select's
  // options are the ones the screen ships.
  ICON_ROLE_GROUPS: [
    { key: 'headcoach', label: 'Every head coach' },
    { key: 'coach', label: 'Every coach' },
    { key: 'manager', label: 'Every manager' },
    { key: 'medic', label: 'Every medic' },
    { key: 'admin', label: 'Every club admin' },
  ],
  iconRoleLabel: (k) => ({ headcoach: 'Every head coach', coach: 'Every coach', manager: 'Every manager', medic: 'Every medic', admin: 'Every club admin' })[k] ?? k,
}))
const listClubMembersMock = vi.fn()
vi.mock('../src/data/members.js', () => ({ listClubMembers: (...a) => listClubMembersMock(...a) }))

import AdminIcons from '../src/screens/AdminIcons.jsx'

const SUPER = [{ id: 'm1', role: 'admin', club_id: 'club-1', status: 'active', is_super: true }]
const TEAMS = [{ id: 't-u11', name: 'U11 ZZ Iconprobe' }, { id: 't-u13', name: 'U13 ZZ Iconprobe' }]

function mount() {
  return render(
    <MemoryRouter>
      <AdminIcons />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({ memberships: SUPER, teams: TEAMS })
  m.listIconGrants.mockResolvedValue([])
  m.grantIcon.mockResolvedValue()
  m.revokeIcon.mockResolvedValue()
  m.setPrimaryIcon.mockResolvedValue()
  listClubMembersMock.mockResolvedValue([
    { profile_id: 'p-1', profiles: { full_name: 'Mira Vantel' } },
    { profile_id: 'p-2', profiles: { full_name: 'Tomas Orrin' } },
  ])
})

describe('AdminIcons', () => {
  it('a non-super gets the not-your-job card and no form', async () => {
    useMembershipsMock.mockReturnValue({ memberships: [{ id: 'm2', role: 'admin', club_id: 'club-1', status: 'active', is_super: false }], teams: TEAMS })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(/super admins/i)
    expect(screen.queryByLabelText('Icon')).toBeNull()
    expect(m.listIconGrants).not.toHaveBeenCalled()
  })

  it('granting the crown to a squad calls through with team, icon and reason', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByLabelText('Icon')
    await user.selectOptions(screen.getByLabelText('Icon'), 'crown')
    await user.selectOptions(screen.getByLabelText("A squad’s staff"), 't-u11')
    await user.type(screen.getByLabelText('Why (optional)'), 'Best age group users of Club Hub')
    await user.click(screen.getByRole('button', { name: 'Grant' }))
    await waitFor(() =>
      expect(m.grantIcon).toHaveBeenCalledWith({
        clubId: 'club-1',
        teamId: 't-u11',
        profileId: null,
        role: null,
        icon: 'crown',
        reason: 'Best age group users of Club Hub',
      }),
    )
  })

  it('granting a star to a person sends profileId and no teamId', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByLabelText('Icon')
    await user.selectOptions(screen.getByLabelText('Icon'), 'star')
    await user.selectOptions(screen.getByLabelText('A person'), 'p-2')
    await user.click(screen.getByRole('button', { name: 'Grant' }))
    await waitFor(() =>
      expect(m.grantIcon).toHaveBeenCalledWith({
        clubId: 'club-1',
        teamId: null,
        profileId: 'p-2',
        role: null,
        icon: 'star',
        reason: '',
      }),
    )
  })

  it('Grant stays disabled until an icon AND exactly one target are picked', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByLabelText('Icon')
    const grant = screen.getByRole('button', { name: 'Grant' })
    expect(grant).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Icon'), 'crown')
    expect(grant).toBeDisabled()
    await user.selectOptions(screen.getByLabelText("A squad’s staff"), 't-u11')
    expect(grant).toBeEnabled()
    // Picking a person TOO makes the shape the database would refuse —
    // the screen must not offer it.
    await user.selectOptions(screen.getByLabelText('A person'), 'p-1')
    expect(grant).toBeDisabled()
    // Nor a role on top (4 Sep 2026): three targets, still exactly one.
    await user.selectOptions(screen.getByLabelText('A person'), '')
    await user.selectOptions(screen.getByLabelText('A role across the club'), 'manager')
    expect(grant).toBeDisabled()
    await user.selectOptions(screen.getByLabelText("A squad’s staff"), '')
    expect(grant).toBeEnabled()
  })

  it('granting to a role across the club sends role and neither team nor person (4 Sep 2026)', async () => {
    // Jay: "give groups like managers or coaches, etc icons as a whole".
    const user = userEvent.setup()
    mount()
    await screen.findByLabelText('Icon')
    await user.selectOptions(screen.getByLabelText('Icon'), 'clipboard')
    await user.selectOptions(screen.getByLabelText('A role across the club'), 'manager')
    await user.click(screen.getByRole('button', { name: 'Grant' }))
    await waitFor(() =>
      expect(m.grantIcon).toHaveBeenCalledWith({
        clubId: 'club-1',
        teamId: null,
        profileId: null,
        role: 'manager',
        icon: 'clipboard',
        reason: '',
      }),
    )
  })

  it('a role grant lists under its group label', async () => {
    m.listIconGrants.mockResolvedValue([
      { id: 'g-r', icon: 'clipboard', reason: null, is_primary: false, profile_id: null, team_id: null, role: 'headcoach', profiles: null, teams: null },
    ])
    mount()
    const row = await screen.findByTestId('icon-grant')
    expect(within(row).getByText('Every head coach')).toBeInTheDocument()
  })

  it('existing grants list with labels; Revoke and Make primary call through', async () => {
    m.listIconGrants.mockResolvedValue([
      { id: 'g1', icon: 'crown', reason: 'Best age group', is_primary: false, profile_id: null, team_id: 't-u11', created_at: '2026-08-31T00:00:00Z', profiles: null, teams: { name: 'U11 ZZ Iconprobe' } },
      { id: 'g2', icon: 'star', reason: null, is_primary: true, profile_id: 'p-1', team_id: null, created_at: '2026-08-30T00:00:00Z', profiles: { full_name: 'Mira Vantel' }, teams: null },
    ])
    const user = userEvent.setup()
    mount()
    const rows = await screen.findAllByTestId('icon-grant')
    expect(rows[0]).toHaveTextContent('👑')
    expect(rows[0]).toHaveTextContent('U11 ZZ Iconprobe staff')
    expect(rows[0]).toHaveTextContent('Best age group')
    expect(rows[1]).toHaveTextContent('⭐')
    expect(rows[1]).toHaveTextContent('Mira Vantel')

    await user.click(within(rows[0]).getByRole('button', { name: 'Make primary' }))
    await waitFor(() => expect(m.setPrimaryIcon).toHaveBeenCalledWith('g1'))
    // g2 is already primary — no button offered.
    expect(within(rows[1]).queryByRole('button', { name: 'Make primary' })).toBeNull()

    await user.click(within(rows[1]).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(m.revokeIcon).toHaveBeenCalledWith('g2'))
  })
})
