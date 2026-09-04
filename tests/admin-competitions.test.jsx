import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Leagues: division setup and the season import —
// claude/plans/2026-09-02-standings-and-results.md, and Jay's 3 Sep 2026
// answer that the RCM grid is IMPORTED, for juniors as for seniors.

const useMembershipsMock = vi.fn()
const importSeasonMock = vi.fn()
const setLeagueTeamCompetitionMock = vi.fn()
const upsertCompetitionMock = vi.fn()
const listKeepersMock = vi.fn()
const setKeeperMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/competitions.js', () => ({
  listCompetitions: async () => COMPETITIONS,
  importSeason: (...args) => importSeasonMock(...args),
  setLeagueTeamCompetition: (...args) => setLeagueTeamCompetitionMock(...args),
  upsertCompetition: (...args) => upsertCompetitionMock(...args),
  listKeepers: (...args) => listKeepersMock(...args),
  setKeeper: (...args) => setKeeperMock(...args),
}))
vi.mock('../src/data/members.js', () => ({
  listClubMembers: async () => [
    { profile_id: 'pr-1', status: 'active', profiles: { full_name: 'Harriet Okonkwo-Lane' } },
    { profile_id: 'pr-1', status: 'active', profiles: { full_name: 'Harriet Okonkwo-Lane' } },
    { profile_id: 'pr-2', status: 'pending', profiles: { full_name: 'Pending Person' } },
    { profile_id: 'pr-3', status: 'active', profiles: { full_name: 'Benedikt Aroyo' } },
  ],
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listAllLeagueTeams: async () => LEAGUE_TEAMS,
}))

import AdminCompetitions from '../src/screens/AdminCompetitions.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
// The season the screen defaults to is derived from the club's today; the
// competitions below are dated to whatever that is, so the default mapping
// can find them.
function thisSeason() {
  const now = new Date()
  const start = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${start}-${String(start + 1).slice(2)}`
}
const SEASON = thisSeason()
const COMPETITIONS = [
  { id: 'c-wap', club_id: CLUB, name: 'West Asia Premiership', season: SEASON, division: 'WAP', is_senior: true, points_win: 4, points_draw: 2, points_loss: 0, bonus_try_threshold: 4, bonus_losing_margin: 7, results_url: null },
  { id: 'c-d1', club_id: CLUB, name: 'Division 1', season: SEASON, division: 'D1', is_senior: true, points_win: 4, points_draw: 2, points_loss: 0, bonus_try_threshold: null, bonus_losing_margin: null, results_url: null },
]
const LEAGUE_TEAMS = [
  { id: 'lt-wap', club_id: CLUB, team_id: 't-men1', rcm_name: 'ADH', division: 'WAP', is_active: true, sort_order: 0, competition_id: null },
  { id: 'lt-d1', club_id: CLUB, team_id: 't-men2', rcm_name: 'ADH', division: 'D1', is_active: true, sort_order: 0, competition_id: null },
]
const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: CLUB }]
const COACH = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-men1', club_id: CLUB }]

// A two-division grid in the RCM shape, small enough to reason about by hand.
const GRID = [
  'WAP WAP DIV1 DIV1',
  'Home Away Home Away',
  '2-3 Oct RD1 RD1 RD1 RD1 ADH Abu Dhabi Harlequins',
  'ADH DEX ADH BHR DEX Dubai Exiles',
  'BAH DOH AAA DT BHR Barrelhouse',
  '9-10 Oct RD2 RD2 RD2 RD2',
  'DOH ADH DT ADH',
  'DEX BAH BHR AAA',
].join('\n')

function renderScreen(memberships = ADMIN) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [], loading: false, error: null, reload: vi.fn() })
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminCompetitions />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  importSeasonMock.mockResolvedValue({ sides_added: 4, fixtures_added: 4, events_linked: 2, events_created: 0 })
  setLeagueTeamCompetitionMock.mockResolvedValue(undefined)
  upsertCompetitionMock.mockResolvedValue({ id: 'c-new' })
  listKeepersMock.mockResolvedValue([])
  setKeeperMock.mockResolvedValue(undefined)
})

describe('Leagues — the season import', () => {
  it('CONTROL: a coach is told it is an admin’s job and sees no import box', async () => {
    renderScreen(COACH)
    expect(await screen.findByText(/admin's job/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Grid text')).not.toBeInTheDocument()
  })

  it('reads the grid, shows every division before writing, and maps each onto its competition', async () => {
    const user = renderScreen()
    await screen.findAllByTestId('competition-row')
    await user.type(screen.getByLabelText('Grid text'), GRID)
    await user.click(screen.getByRole('button', { name: /read the grid/i }))

    const divisions = await screen.findAllByTestId('import-division')
    expect(divisions).toHaveLength(2)
    expect(divisions[0]).toHaveTextContent('WAP · 2 rounds · 4 games · 4 sides')
    // The default mapping: WAP → the Premiership competition, our side ADH
    // (the legend names the club), our league team the one in that division.
    expect(within(divisions[0]).getByLabelText('WAP competition')).toHaveValue('c-wap')
    expect(within(divisions[0]).getByLabelText('WAP our side')).toHaveValue('ADH')
    expect(within(divisions[0]).getByLabelText('WAP league team')).toHaveValue('lt-wap')
    expect(within(divisions[1]).getByLabelText('DIV1 competition')).toHaveValue('c-d1')
    expect(within(divisions[1]).getByLabelText('DIV1 league team')).toHaveValue('lt-d1')
    expect(importSeasonMock).not.toHaveBeenCalled()
  })

  it('⚠️ imports one atomic call per division, naming sides from the legend and our league team on our side only', async () => {
    const user = renderScreen()
    await screen.findAllByTestId('competition-row')
    await user.type(screen.getByLabelText('Grid text'), GRID)
    await user.click(screen.getByRole('button', { name: /read the grid/i }))
    await screen.findAllByTestId('import-division')
    await user.click(screen.getByRole('button', { name: /^import$/i }))

    await waitFor(() => expect(importSeasonMock).toHaveBeenCalledTimes(2))
    const [wapId, wap] = importSeasonMock.mock.calls[0]
    expect(wapId).toBe('c-wap')
    expect(wap.sides).toEqual(
      expect.arrayContaining([
        { name: 'Abu Dhabi Harlequins', code: 'ADH', league_team_id: 'lt-wap' },
        { name: 'Dubai Exiles', code: 'DEX', league_team_id: null },
        // A side the legend does not name keeps its code as its name.
        { name: 'BAH', code: 'BAH', league_team_id: null },
      ]),
    )
    expect(wap.fixtures).toEqual([
      { round: 1, played_on: '2026-10-03', home: 'ADH', away: 'DEX' },
      { round: 1, played_on: '2026-10-03', home: 'BAH', away: 'DOH' },
      { round: 2, played_on: '2026-10-10', home: 'DOH', away: 'ADH' },
      { round: 2, played_on: '2026-10-10', home: 'DEX', away: 'BAH' },
    ])
    expect(setLeagueTeamCompetitionMock).toHaveBeenCalledWith('lt-wap', 'c-wap')
    expect(setLeagueTeamCompetitionMock).toHaveBeenCalledWith('lt-d1', 'c-d1')
    expect(await screen.findByTestId('import-report')).toHaveTextContent('West Asia Premiership: 4 sides and 4 fixtures added, 2 of our games linked, 0 added to the schedule.')
  })

  it('a division mapped to "skip" is left alone', async () => {
    const user = renderScreen()
    await screen.findAllByTestId('competition-row')
    await user.type(screen.getByLabelText('Grid text'), GRID)
    await user.click(screen.getByRole('button', { name: /read the grid/i }))
    await screen.findAllByTestId('import-division')
    await user.selectOptions(screen.getByLabelText('DIV1 competition'), '')
    await user.click(screen.getByRole('button', { name: /^import$/i }))
    await waitFor(() => expect(importSeasonMock).toHaveBeenCalledTimes(1))
    expect(importSeasonMock.mock.calls[0][0]).toBe('c-wap')
    expect(await screen.findByTestId('import-report')).toHaveTextContent('DIV1: skipped')
  })
})

describe('Leagues — division setup', () => {
  it('saves a new division with its points rules as numbers and nulls for unused bonuses', async () => {
    const user = renderScreen()
    await screen.findAllByTestId('competition-row')
    await user.click(screen.getByRole('button', { name: /add division/i }))
    await user.type(screen.getByLabelText('Division name'), 'U14 Division B')
    await user.selectOptions(screen.getByLabelText('Division code'), 'B')
    await user.click(screen.getByLabelText(/senior division/i))
    await user.clear(screen.getByLabelText('Try bonus threshold'))
    await user.clear(screen.getByLabelText('Losing bonus margin'))
    await user.click(screen.getByRole('button', { name: /save division/i }))
    await waitFor(() => expect(upsertCompetitionMock).toHaveBeenCalledTimes(1))
    expect(upsertCompetitionMock.mock.calls[0][0]).toEqual({
      club_id: CLUB,
      name: 'U14 Division B',
      season: SEASON,
      division: 'B',
      is_senior: false,
      points_win: 4,
      points_draw: 2,
      points_loss: 0,
      bonus_try_threshold: null,
      bonus_losing_margin: null,
      results_url: null,
    })
  })
})

describe('Leagues — results keepers (4 Sep 2026)', () => {
  it("names a keeper from the club's active people, one entry per person, and removes one", async () => {
    listKeepersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ competition_id: 'c-wap', profile_id: 'pr-3', profiles: { full_name: 'Benedikt Aroyo' } }])
      .mockResolvedValue([])
    const user = renderScreen()
    await screen.findAllByTestId('competition-row')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const box = await screen.findByTestId('keepers')
    expect(box).toHaveTextContent('Nobody named yet.')
    const pick = within(box).getByLabelText('Add a keeper')
    // Active people only, once each, sorted by name.
    const names = [...pick.options].map((o) => o.textContent).slice(1)
    expect(names).toEqual(['Benedikt Aroyo', 'Harriet Okonkwo-Lane'])
    await user.selectOptions(pick, 'pr-3')
    await user.click(within(box).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(setKeeperMock).toHaveBeenCalledWith('c-wap', 'pr-3', true))
    expect(await within(box).findByText('Benedikt Aroyo')).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(setKeeperMock).toHaveBeenCalledWith('c-wap', 'pr-3', false))
  })
})
