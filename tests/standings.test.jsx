import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The league table — claude/plans/2026-09-02-standings-and-results.md.
// The table itself is computed in the database; this screen renders what
// competition_standings returns, counts the missing results from the imported
// fixtures, and lets a keeper type a round.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const recordResultsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))

const COMP = { id: 'c1', club_id: 'club', name: 'West Asia Premiership', season: '2026-27', division: 'WAP', is_senior: true, results_url: 'https://example.invalid/results', points_win: 4, points_draw: 2, points_loss: 0, bonus_try_threshold: 4, bonus_losing_margin: 7 }
const SIDES = [
  { id: 's-us', competition_id: 'c1', name: 'Abu Dhabi Harlequins', code: 'ADH', league_team_id: 'lt-1', sort_order: 1 },
  { id: 's-dex', competition_id: 'c1', name: 'Dubai Exiles', code: 'DEX', league_team_id: null, sort_order: 2 },
  { id: 's-bah', competition_id: 'c1', name: 'Bahrain', code: 'BAH', league_team_id: null, sort_order: 3 },
  { id: 's-doh', competition_id: 'c1', name: 'Doha', code: 'DOH', league_team_id: null, sort_order: 4 },
]
// Round 1 was long ago: one game has a result, one is missing. Round 2 is in
// the far future.
const FIXTURES = [
  { id: 'f1', competition_id: 'c1', round: 1, played_on: '2020-10-03', home_side_id: 's-us', away_side_id: 's-dex', event_id: 'e1' },
  { id: 'f2', competition_id: 'c1', round: 1, played_on: '2020-10-03', home_side_id: 's-bah', away_side_id: 's-doh', event_id: null },
  { id: 'f3', competition_id: 'c1', round: 2, played_on: '2099-10-10', home_side_id: 's-dex', away_side_id: 's-bah', event_id: null },
]
const RESULTS = [
  { id: 'r1', competition_id: 'c1', fixture_id: 'f1', round: 1, played_on: '2020-10-03', home_side_id: 's-us', away_side_id: 's-dex', home_score: 24, away_score: 10, source: 'sheet', confirmed_by: 'staff', confirmed_at: '2020-10-03T14:00:00Z', supersedes: null, superseded_at: null },
]
const TABLE = [
  { pos: 1, side_id: 's-us', side: 'Abu Dhabi Harlequins', is_ours: true, played: 1, won: 1, drawn: 0, lost: 0, points_for: 24, points_against: 10, difference: 14, bonus: 0, points: 4 },
  { pos: 2, side_id: 's-bah', side: 'Bahrain', is_ours: false, played: 0, won: 0, drawn: 0, lost: 0, points_for: 0, points_against: 0, difference: 0, bonus: 0, points: 0 },
  { pos: 3, side_id: 's-doh', side: 'Doha', is_ours: false, played: 0, won: 0, drawn: 0, lost: 0, points_for: 0, points_against: 0, difference: 0, bonus: 0, points: 0 },
  { pos: 4, side_id: 's-dex', side: 'Dubai Exiles', is_ours: false, played: 1, won: 0, drawn: 0, lost: 1, points_for: 10, points_against: 24, difference: -14, bonus: 0, points: 0 },
]

vi.mock('../src/data/competitions.js', () => ({
  getCompetition: async () => COMP,
  listSides: async () => SIDES,
  listFixtures: async () => FIXTURES,
  listResults: async () => RESULTS,
  standings: async () => TABLE,
  listKeepers: async () => [{ competition_id: 'c1', profile_id: 'keeper-1' }],
  recordResults: (...args) => recordResultsMock(...args),
}))

import Standings from '../src/screens/Standings.jsx'

const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: 'club' }]
const PARENT = [{ id: 'm-p', role: 'parent', status: 'active', team_id: 't1', club_id: 'club' }]

function renderStandings({ memberships = PARENT, userId = 'someone' } = {}) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [], loading: false, error: null, reload: vi.fn() })
  useAuthMock.mockReturnValue({ user: { id: userId } })
  render(
    <MemoryRouter initialEntries={['/standings/c1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/standings/:competitionId" element={<Standings />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  recordResultsMock.mockResolvedValue([])
})

describe('the league table', () => {
  it('renders the table the database computed, in order, with our row marked', async () => {
    renderStandings()
    const rows = await screen.findAllByTestId('standings-row')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Abu Dhabi Harlequins')
    expect(rows[0].className).toMatch(/font-extrabold/)
    expect(rows[1].className).not.toMatch(/font-extrabold/)
    expect(within(rows[0]).getAllByRole('cell').at(-1)).toHaveTextContent('4')
  })

  it('counts the results missing from rounds already played, and links the union page', async () => {
    renderStandings()
    await screen.findAllByTestId('standings-row')
    // f2 (Bahrain v Doha, 2020) has no result; f3 is in the future and does not count.
    expect(screen.getByTestId('standings-status')).toHaveTextContent('1 result missing')
    expect(screen.getByRole('link', { name: /union results page/i })).toHaveAttribute('href', COMP.results_url)
    expect(screen.getByText(/4 for a win, 2 a draw · bonus for 4 tries or losing by 7 or fewer/)).toBeInTheDocument()
  })

  it('CONTROL: a member who is not a keeper sees the round but no score boxes', async () => {
    renderStandings()
    await screen.findAllByTestId('standings-row')
    expect(screen.queryByRole('textbox', { name: /score/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save round/i })).not.toBeInTheDocument()
    // The sheet result still shows, tagged with where it came from.
    expect(screen.getByText('24 – 10')).toBeInTheDocument()
    expect(screen.getByText('match sheet')).toBeInTheDocument()
  })

  it('a keeper types the missing score and it is saved as a confirmed typed result in their name', async () => {
    const user = renderStandings({ userId: 'keeper-1' })
    await screen.findAllByTestId('standings-row')
    // Round 1 is the default: the latest round whose day has passed.
    // findBy: the round defaults in an effect after the first paint, and CI
    // (4 Sep 2026) reached the score boxes before that paint had happened.
    await waitFor(() => expect(screen.getByLabelText('Round')).toHaveValue('1'))
    await user.type(await screen.findByLabelText('Bahrain score'), '17')
    await user.type(screen.getByLabelText('Doha score'), '12')
    await user.click(screen.getByRole('button', { name: /save round/i }))
    await waitFor(() => expect(recordResultsMock).toHaveBeenCalledTimes(1))
    const [competitionId, rows, options] = recordResultsMock.mock.calls[0]
    expect(competitionId).toBe('c1')
    expect(options).toEqual({ profileId: 'keeper-1' })
    expect(rows).toEqual([
      expect.objectContaining({ fixture_id: 'f2', round: 1, home_side_id: 's-bah', away_side_id: 's-doh', home_score: '17', away_score: '12', supersedes: null }),
    ])
  })

  it('⚠️ our own sheet result is not typed over here — no Correct link on a sheet row', async () => {
    const user = renderStandings({ memberships: ADMIN, userId: 'admin-1' })
    await screen.findAllByTestId('standings-row')
    const rows = screen.getAllByTestId('result-row')
    const ours = rows.find((row) => within(row).queryByText('24 – 10'))
    expect(ours).toBeTruthy()
    expect(within(ours).queryByRole('button', { name: /correct/i })).not.toBeInTheDocument()
    // Control: a typed correction path exists for the other row's inputs.
    expect(await screen.findByLabelText('Bahrain score')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save round/i }))
    // Nothing typed, nothing saved.
    expect(recordResultsMock).not.toHaveBeenCalled()
  })
})
