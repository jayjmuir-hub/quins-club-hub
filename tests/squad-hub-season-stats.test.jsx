import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

// The season stats card on a senior squad's Squad Hub page — Task 7 of
// claude/plans/2026-09-04-senior-season-stats.md. Consumes seasonStats /
// seasonStatsGaps (Task 4), seasonLabelFor (Task 3) and SeasonStatsTable
// (Task 6), all wired into SquadHub.jsx.
//
// ⚠️ WHAT DISCRIMINATES HERE: the junior-squad test asserts seasonStatsMock
// was never called, not just that the card is absent — a card that failed
// to render for the wrong reason would still pass a card-only assertion.

const useMembershipsMock = vi.fn()
const seasonStatsMock = vi.fn()
const seasonStatsGapsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ listEvents: async () => [], subscribeEvents: () => () => {} }))
vi.mock('../src/data/players.js', () => ({ listPlayers: async () => [], subscribePlayers: () => () => {} }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: async () => [] }))
vi.mock('../src/data/attendance.js', () => ({ listAttendanceForEvents: async () => [] }))
vi.mock('../src/data/matchSheets.js', () => ({ listMatchSheetsFor: async () => [] }))
vi.mock('../src/data/leagueTeams.js', () => ({ listLeagueTeams: async () => [] }))
vi.mock('../src/data/announcements.js', () => ({ listNotices: async () => [], listMyReads: async () => [] }))
vi.mock('../src/data/documents.js', () => ({ listDocuments: async () => [], signDocumentUrl: async () => 'https://signed.example.invalid' }))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: (...a) => seasonStatsMock(...a),
  seasonStatsGaps: (...a) => seasonStatsGapsMock(...a),
}))
vi.mock('../src/components/CallupCard.jsx', () => ({ default: () => null }))
vi.mock('../src/screens/EventDetail.jsx', () => ({ default: () => null }))
vi.mock('../src/screens/Availability.jsx', () => ({ default: () => null }))
vi.mock('../src/screens/Register.jsx', () => ({ default: () => null }))

import SquadHub from '../src/screens/SquadHub.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 't-men1', club_id: CLUB, name: 'Senior Men - 1st XV', sort_order: 16, section: 'senior_men', is_senior: true },
  { id: 't-men2', club_id: CLUB, name: 'Senior Men - 2nd XV', sort_order: 17, section: 'senior_men', is_senior: true },
  { id: 't-u12', club_id: CLUB, name: 'U12 Mixed', sort_order: 3, section: null, is_senior: false },
]
// Invented name — this repo is public and its members are mostly children.
const ROWS = [
  { player_id: 'p1', full_name: 'Harness Fly Half', games: 3, starts: 3, bench: 0, tries: 1, conversions: 4, penalties: 2, drops: 0, yellows: 0, reds: 0 },
]

function renderAs(teamId) {
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'coach', status: 'active', team_id: teamId, club_id: CLUB }],
    teams: TEAMS,
    loading: false,
  })
  render(
    <MemoryRouter initialEntries={[`/squad/${teamId}`]}>
      <Routes>
        <Route path="/squad/:teamId" element={<SquadHub />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  seasonStatsMock.mockResolvedValue(ROWS)
  seasonStatsGapsMock.mockResolvedValue({ played: 7, unnamed: 2 })
})

describe('the squad page — season stats', () => {
  it('a senior squad gets the card, this season, and the gap line', async () => {
    renderAs('t-men1')
    expect(await screen.findByTestId('season-stats-card')).toBeInTheDocument()
    expect(seasonStatsMock).toHaveBeenCalledWith('t-men1', expect.stringMatching(/^\d{4}-\d{2}$/))
    expect(await screen.findByText('Harness Fly Half')).toBeInTheDocument()
    expect(screen.getByText('2 of 7 played games have no scorers named.')).toBeInTheDocument()
  })
  it('a junior squad gets no card and asks the database nothing', async () => {
    renderAs('t-u12')
    await screen.findByRole('heading', { name: /U12 Mixed/ })
    expect(screen.queryByTestId('season-stats-card')).not.toBeInTheDocument()
    expect(seasonStatsMock).not.toHaveBeenCalled()
  })

  // Review finding on Task 7: the effect reset nothing when a senior squad's
  // fetch begins, so a same-mount switch (the multi-squad staff switcher,
  // not an unmount/remount) into a squad whose fetch FAILS left the PREVIOUS
  // squad's gap sentence on screen, attributed to the new squad's card.
  it('drops the previous squad\'s gap sentence when a same-mount switch fails', async () => {
    seasonStatsMock.mockImplementation((teamId) =>
      teamId === 't-men1' ? Promise.resolve(ROWS) : Promise.reject(new Error('boom')),
    )
    seasonStatsGapsMock.mockImplementation((teamId) =>
      teamId === 't-men1' ? Promise.resolve({ played: 7, unnamed: 2 }) : Promise.reject(new Error('boom')),
    )
    useMembershipsMock.mockReturnValue({
      memberships: [
        { id: 'm1', role: 'coach', status: 'active', team_id: 't-men1', club_id: CLUB },
        { id: 'm2', role: 'coach', status: 'active', team_id: 't-men2', club_id: CLUB },
      ],
      teams: TEAMS,
      loading: false,
    })
    render(
      <MemoryRouter initialEntries={['/squad/t-men1']}>
        <Routes>
          <Route path="/squad/:teamId" element={<SquadHub />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('2 of 7 played games have no scorers named.')).toBeInTheDocument()

    const user = userEvent.setup()
    const switcher = screen.getByRole('combobox', { name: 'Squad' })
    await user.click(switcher)
    await user.click(screen.getByRole('option', { name: 'Senior Men - 2nd XV' }))

    await waitFor(() =>
      expect(screen.queryByText(/played games have no scorers named/)).not.toBeInTheDocument(),
    )
    expect(await screen.findByText('No games on a sheet yet.')).toBeInTheDocument()
  })
})
