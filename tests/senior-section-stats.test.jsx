import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const useMembershipsMock = vi.fn()
const seasonStatsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ listEvents: async () => [] }))
vi.mock('../src/data/players.js', () => ({ listPlayers: async () => [] }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: async () => [] }))
vi.mock('../src/data/leagueTeams.js', () => ({ listAllLeagueTeams: async () => [] }))
vi.mock('../src/data/competitions.js', () => ({ standings: async () => [] }))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: (...a) => seasonStatsMock(...a),
  seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }),
}))

import SeniorSection from '../src/screens/SeniorSection.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 'men1', club_id: CLUB, name: 'Senior Men - 1st XV', section: 'senior_men', sort_order: 16, is_senior: true },
  { id: 'men2', club_id: CLUB, name: 'Senior Men - 2nd XV', section: 'senior_men', sort_order: 17, is_senior: true },
  { id: 'women', club_id: CLUB, name: 'Senior Women', section: 'senior_women', sort_order: 19, is_senior: true },
]
const MEN2_PLAYER = [{ id: 'm1', role: 'player', status: 'active', team_id: 'men2', club_id: CLUB }]

function rowsFor(teamId, n) {
  return Array.from({ length: n }, (_, i) => ({
    player_id: `${teamId}-p${i}`, full_name: `Harness ${teamId} ${i}`, games: n - i, starts: n - i, bench: 0,
    tries: 0, conversions: 0, penalties: 0, drops: 0, yellows: 0, reds: 0,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  seasonStatsMock.mockImplementation(async (teamId) => rowsFor(teamId, teamId === 'men1' ? 7 : 2))
})

describe('the seniors overview — season stats', () => {
  it('one table per squad of the section, top five with Show all', async () => {
    useMembershipsMock.mockReturnValue({ memberships: MEN2_PLAYER, teams: TEAMS, loading: false, error: null, reload: vi.fn() })
    render(
      <MemoryRouter initialEntries={['/seniors']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SeniorSection />
      </MemoryRouter>,
    )
    const section = await screen.findByTestId('season-stats')
    const blocks = within(section).getAllByTestId('season-stats-squad')
    expect(blocks).toHaveLength(2)
    expect(seasonStatsMock).toHaveBeenCalledWith('men1', expect.any(String))
    expect(seasonStatsMock).toHaveBeenCalledWith('men2', expect.any(String))
    expect(seasonStatsMock).not.toHaveBeenCalledWith('women', expect.any(String))

    const first = blocks[0]
    expect(within(first).getAllByTestId('season-stats-row')).toHaveLength(5)
    await userEvent.setup().click(within(first).getByRole('button', { name: 'Show all 7' }))
    expect(within(first).getAllByTestId('season-stats-row')).toHaveLength(7)
  })
})
