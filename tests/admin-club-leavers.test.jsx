import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The "Left this season" list on the Club tab, with Restore. Task 7 of the
// "marking a player as left" plan — spec
// claude/specs/2026-09-02-player-leavers-design.md.
//
// ⚠️ NOTHING HERE IS SECURITY. restore_player is RLS/RPC-gated server-side;
// this only proves the screen calls it and reloads.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listAllLeagueTeamsMock = vi.fn()
const restorePlayerMock = vi.fn()
const reloadMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  listContactsForPlayers: (...args) => listContactsForPlayersMock(...args),
  restorePlayer: (...args) => restorePlayerMock(...args),
  listPlayerPrivate: async () => [],
}))
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  listClubMembers: vi.fn(),
  createInvite: vi.fn(),
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listAllLeagueTeams: (...args) => listAllLeagueTeamsMock(...args),
  upsertLeagueTeam: vi.fn(),
  setLeagueTeamActive: vi.fn(),
}))
vi.mock('../src/data/teams.js', () => ({
  setTeamScoringKinds: vi.fn(),
  setTeamRequiresContact: vi.fn(),
}))

import AdminClub from '../src/screens/AdminClub.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U14 = { id: 't-u14', club_id: CLUB, name: 'U14B Contact', sort_order: 1 }
const TEAMS = [U14]

const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: CLUB }]

async function renderAdminClub(teams = TEAMS) {
  const user = userEvent.setup()
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams,
    loading: false,
    error: null,
    reload: reloadMock,
  })
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminClub />
    </MemoryRouter>,
  )
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listAllLeagueTeamsMock.mockResolvedValue([])
  restorePlayerMock.mockResolvedValue({})
  reloadMock.mockResolvedValue(undefined)
})

describe('AdminClub — Left this season', () => {
  it('lists leavers with squad and date, and Restore calls the RPC and reloads', async () => {
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', team_id: 't-u14', full_name: 'Tomasz Delacroix-Obi', left_at: null },
      { id: 'p-2', team_id: 't-u14', full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z', left_by: 'pr-coach' },
    ])
    const user = await renderAdminClub()
    const section = await screen.findByRole('region', { name: /left this season/i })
    expect(within(section).getByText('Rafiq Delacroix-Obi')).toBeInTheDocument()
    expect(within(section).getByText(/U14/)).toBeInTheDocument()
    expect(within(section).getByText(/2 Sep 2026/)).toBeInTheDocument()
    expect(within(section).queryByText('Tomasz Delacroix-Obi')).toBeNull()
    await user.click(within(section).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(restorePlayerMock).toHaveBeenCalledWith('p-2'))
    await waitFor(() => expect(listPlayersMock).toHaveBeenCalledTimes(2))
  })

  it('shows nothing when nobody has left', async () => {
    listPlayersMock.mockResolvedValue([{ id: 'p-1', team_id: 't-u14', full_name: 'Tomasz Delacroix-Obi', left_at: null }])
    await renderAdminClub()
    expect(screen.queryByRole('region', { name: /left this season/i })).toBeNull()
  })
})
