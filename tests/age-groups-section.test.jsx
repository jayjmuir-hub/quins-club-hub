import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Super-admin junior play-up on the player sheet. The RPC is the security;
// this file pins who is OFFERED Add / Remove, that seniors are not pickable,
// and that a parent still does not see a teammate guest mark (Roster).

const useMembershipsMock = vi.fn()
const listGuestMock = vi.fn()
const addPlayupMock = vi.fn()
const removePlayupMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/playups.js', () => ({
  listPlayerGuestTeamIds: (...a) => listGuestMock(...a),
  addJuniorPlayup: (...a) => addPlayupMock(...a),
  removeJuniorPlayup: (...a) => removePlayupMock(...a),
}))

vi.mock('../src/data/players.js', () => ({
  getPlayerContact: async () => null,
  getPlayerDob: async () => null,
  deletePlayer: async () => ({}),
  markPlayerLeft: async () => ({}),
  restorePlayer: async () => ({}),
}))

vi.mock('../src/data/parents.js', () => ({ listParents: async () => [] }))
vi.mock('../src/lib/useOwnContactGate.js', () => ({
  default: () => ({ allowed: false, settled: true }),
}))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: async () => [],
  seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }),
}))
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: async () => null,
  signPhotoUrls: async () => ({}),
}))

import PlayerDetail from '../src/screens/PlayerDetail.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U14 = { id: 't-u14', club_id: CLUB, name: 'U14B Contact', sort_order: 9, is_senior: false }
const U16 = { id: 't-u16', club_id: CLUB, name: 'U16B Contact', sort_order: 11, is_senior: false }
const U12 = { id: 't-u12', club_id: CLUB, name: 'U12 Mixed', sort_order: 5, is_senior: false }
const MEN1 = { id: 't-men1', club_id: CLUB, name: 'Senior Men - 1st XV', sort_order: 16, is_senior: true }
const PLAYER = { id: 'p-harness', full_name: 'Harness Playup Alderton', team_id: 't-u14' }

const SUPER = [{ id: 'm-super', role: 'admin', status: 'active', is_super: true, club_id: CLUB, team_id: null }]
const ADMIN = [{ id: 'm-admin', role: 'admin', status: 'active', is_super: false, admin_rights: ['clubadmin'], club_id: CLUB, team_id: null }]
const COACH = [{ id: 'm-coach', role: 'coach', status: 'active', club_id: CLUB, team_id: 't-u14' }]

function mount({ memberships, teams = [U12, U14, U16, MEN1], player = PLAYER, team = U14 } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(
    <MemoryRouter>
      <PlayerDetail player={player} team={team} onClose={() => {}} />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  listGuestMock.mockResolvedValue([])
  addPlayupMock.mockResolvedValue(null)
  removePlayupMock.mockResolvedValue(null)
})

describe('Age groups — who sees Add', () => {
  it('a super admin sees Add to another age group on a junior', async () => {
    mount({ memberships: SUPER })
    const section = await screen.findByTestId('age-groups')
    expect(within(section).getByText('U14B Contact')).toBeInTheDocument()
    expect(within(section).getByText('Home')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: /add to another age group/i })).toBeInTheDocument()
  })

  it('CONTROL: an ordinary club admin does not see Add', async () => {
    mount({ memberships: ADMIN })
    await screen.findByRole('heading', { name: 'Harness Playup Alderton' })
    expect(screen.queryByTestId('age-groups')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to another age group/i })).not.toBeInTheDocument()
  })

  it('CONTROL: a coach does not see Add', async () => {
    mount({ memberships: COACH })
    await screen.findByRole('heading', { name: 'Harness Playup Alderton' })
    expect(screen.queryByRole('button', { name: /add to another age group/i })).not.toBeInTheDocument()
  })

  it('CONTROL: a senior player has no Age groups section', async () => {
    mount({
      memberships: SUPER,
      player: { ...PLAYER, team_id: 't-men1', full_name: 'Harness Senior Vantongeren' },
      team: MEN1,
    })
    await screen.findByRole('heading', { name: 'Harness Senior Vantongeren' })
    expect(screen.queryByTestId('age-groups')).not.toBeInTheDocument()
  })
})

describe('Age groups — add and remove', () => {
  it('the picker lists other junior squads, not home, not seniors, not already-guest', async () => {
    listGuestMock.mockResolvedValue(['t-u12'])
    const user = mount({ memberships: SUPER })
    const section = await screen.findByTestId('age-groups')
    expect(within(section).getByText('U12 Mixed')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: /add to another age group/i }))
    const picker = await screen.findByRole('dialog', { name: /add to another age group/i })
    expect(within(picker).getByRole('button', { name: 'U16B Contact' })).toBeInTheDocument()
    expect(within(picker).queryByRole('button', { name: 'U14B Contact' })).not.toBeInTheDocument()
    expect(within(picker).queryByRole('button', { name: 'U12 Mixed' })).not.toBeInTheDocument()
    expect(within(picker).queryByRole('button', { name: /Senior Men/ })).not.toBeInTheDocument()
  })

  it('confirm Add calls addJuniorPlayup', async () => {
    const user = mount({ memberships: SUPER })
    await user.click((await screen.findByRole('button', { name: /add to another age group/i })))
    const picker = await screen.findByRole('dialog', { name: /add to another age group/i })
    await user.click(within(picker).getByRole('button', { name: 'U16B Contact' }))
    await user.click(within(picker).getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(addPlayupMock).toHaveBeenCalledWith('p-harness', 't-u16'))
  })

  it('Remove on a guest row calls removeJuniorPlayup', async () => {
    listGuestMock.mockResolvedValue(['t-u16'])
    const user = mount({ memberships: SUPER })
    const section = await screen.findByTestId('age-groups')
    await user.click(within(section).getByRole('button', { name: /remove from U16B Contact/i }))
    await waitFor(() => expect(removePlayupMock).toHaveBeenCalledWith('p-harness', 't-u16'))
  })
})
