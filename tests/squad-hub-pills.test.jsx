import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Call-ups stay off Overview — the pool lives on the Call-ups pill.
// Invented names. CLAUDE.md rule 9.

const useMembershipsMock = vi.fn()
const listCandidatesMock = vi.fn()
const listEventsMock = vi.fn(async () => [])
const listPlayersMock = vi.fn(async () => [])

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/callups.js', () => ({
  listCallupCandidates: (...a) => listCandidatesMock(...a),
  requestCallup: async () => ({}),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: (...a) => listEventsMock(...a),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailabilityForEvents: async () => [],
}))
vi.mock('../src/data/attendance.js', () => ({
  listAttendanceForEvents: async () => [],
}))
vi.mock('../src/data/matchSheets.js', () => ({
  listMatchSheetsFor: async () => new Map(),
}))
vi.mock('../src/data/announcements.js', () => ({
  listNotices: async () => [],
  listMyReads: async () => [],
}))
vi.mock('../src/data/documents.js', () => ({
  listDocuments: async () => [],
  signDocumentUrl: async () => 'https://signed.example.invalid',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: async () => [],
}))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: async () => [],
  seasonStatsGaps: () => ({ unnamed: 0, played: 0 }),
}))

import SquadHub from '../src/screens/SquadHub.jsx'
import SquadCallups from '../src/screens/SquadCallups.jsx'

const MEN = { id: 't-men', name: 'Senior Men - 2nd XV', sort_order: 20, is_senior: true, section: 'senior_men' }

beforeEach(() => {
  vi.clearAllMocks()
  listCandidatesMock.mockResolvedValue([
    { player_id: 'p-a', full_name: 'Idris Vantongeren', home_team_id: 't-u18', home_team: 'U18B', state: 'consent_needed' },
    { player_id: 'p-g', full_name: 'Niamh Colter', home_team_id: 't-u18g', home_team: 'U18G', state: 'consent_needed' },
  ])
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'coach', status: 'active', team_id: 't-men', is_head_coach: true }],
    teams: [MEN],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
})

describe('Squad Hub Call-ups pill', () => {
  it('does not dump the U18 pool on Overview', async () => {
    render(
      <MemoryRouter initialEntries={['/squad/t-men']}>
        <Routes>
          <Route path="/squad/:teamId" element={<SquadHub />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/tracked/i)).toBeInTheDocument()
    expect(screen.queryByTestId('callup-candidate')).not.toBeInTheDocument()
    expect(screen.queryByTestId('callup-card')).not.toBeInTheDocument()
    expect(listCandidatesMock).not.toHaveBeenCalled()
  })

  it('lists the gender-matched pool on the Call-ups pill', async () => {
    render(
      <MemoryRouter initialEntries={['/squad/t-men/callups']}>
        <Routes>
          <Route path="/squad/:teamId/callups" element={<SquadCallups />} />
        </Routes>
      </MemoryRouter>,
    )
    const rows = await screen.findAllByTestId('callup-candidate')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Idris Vantongeren')
    expect(rows[0]).toHaveTextContent('Not asked yet')
    expect(screen.queryByText('Niamh Colter')).not.toBeInTheDocument()
  })
})
