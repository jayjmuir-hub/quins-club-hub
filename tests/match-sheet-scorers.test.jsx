import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const useMembershipsMock = vi.fn()
const useMyProfileMock = vi.fn()
const upsertEventMock = vi.fn()
const getEventMock = vi.fn()
const listPlayersMock = vi.fn()
const getMatchSheetMock = vi.fn()
const saveMatchSheetMock = vi.fn()
const saveSlotsMock = vi.fn()
const saveCardsMock = vi.fn()
const saveScoresMock = vi.fn()
const setStatusMock = vi.fn()
const listLineupsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/useMyProfile.js', () => ({ default: () => useMyProfileMock() }))
vi.mock('../src/data/events.js', () => ({
  getEvent: (...a) => getEventMock(...a),
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...a) => upsertEventMock(...a),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  subscribePlayers: () => () => {},
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
}))
vi.mock('../src/data/matchSheets.js', async () => {
  const actual = await vi.importActual('../src/data/matchSheets.js')
  return {
    ...actual,
    getMatchSheet: (...a) => getMatchSheetMock(...a),
    saveMatchSheet: (...a) => saveMatchSheetMock(...a),
    saveMatchSheetSlots: (...a) => saveSlotsMock(...a),
    saveMatchSheetCards: (...a) => saveCardsMock(...a),
    saveMatchSheetScores: (...a) => saveScoresMock(...a),
    setMatchSheetStatus: (...a) => setStatusMock(...a),
  }
})

import MatchSheet from '../src/screens/MatchSheet.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const MEN1 = { id: 't-men1', club_id: CLUB, name: 'Senior Men - 1st XV', sort_order: 16, section: 'senior_men', is_senior: true }
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9, section: null }

function matchFor(team) {
  return {
    id: 'e-1',
    club_id: CLUB,
    team_id: team.id,
    type: 'match',
    competition_type: 'league',
    opponent: 'Harness Opposition',
    home: true,
    starts_at: '2026-10-10T11:00:00.000Z',
    ends_at: '2026-10-10T12:30:00.000Z',
    round: 1,
    league_team_id: null,
    league_team: null,
    team,
    tries_us: 3,
    conversions_us: 1,
  }
}

function mount(team, eventOverride) {
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm-c', role: 'coach', status: 'active', team_id: team.id, club_id: CLUB }],
    teams: [team],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  // ⚠️ Takes an optional pre-built event so a caller can override a field
  // (e.g. a blank score) — setting getEventMock's resolved value BEFORE this
  // call and letting mount() clobber it back to the plain matchFor() would
  // silently discard the override, since the component's load effect fires
  // synchronously inside render() below.
  getEventMock.mockResolvedValue(eventOverride ?? matchFor(team))
  render(
    <MemoryRouter initialEntries={['/match-sheet/e-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/match-sheet/:eventId" element={<MatchSheet />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  useMyProfileMock.mockReturnValue({ profile: null, firstName: '' })
  upsertEventMock.mockImplementation(async (patch) => ({ ...patch }))
  listPlayersMock.mockResolvedValue([
    { id: 'p1', team_id: 't-men1', full_name: 'Harness Fly Half' },
    { id: 'p2', team_id: 't-men1', full_name: 'Harness Hooker' },
  ])
  getMatchSheetMock.mockResolvedValue(null)
  listLineupsMock.mockResolvedValue([])
  saveMatchSheetMock.mockResolvedValue({ id: 'ms-1', status: 'draft', league_team_id: null, league_team: null })
  saveSlotsMock.mockResolvedValue([])
  saveCardsMock.mockResolvedValue([])
  saveScoresMock.mockResolvedValue([])
  setStatusMock.mockResolvedValue({ id: 'ms-1', status: 'complete' })
})

describe('the scorers block — seniors only', () => {
  it('is absent on a junior squad’s sheet', async () => {
    mount(U14B)
    await screen.findByTestId('match-sheet-facsimile')
    expect(screen.queryByRole('heading', { name: 'Scorers' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Scorer 1 kind')).not.toBeInTheDocument()
  })

  it('is present on a senior squad’s sheet, lists the filled slots by name, and saves the rows', async () => {
    const user = mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    expect(screen.getByRole('heading', { name: 'Scorers' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Player 10'), 'Harness Fly Half')
    await user.selectOptions(screen.getByLabelText('Scorer 1 kind'), 'tries')
    // The player select offers the slot by its number and filed name.
    await user.selectOptions(screen.getByLabelText('Scorer 1 player'), '10')
    await user.clear(screen.getByLabelText('Scorer 1 how many'))
    await user.type(screen.getByLabelText('Scorer 1 how many'), '2')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveScoresMock).toHaveBeenCalled())
    const [sheetId, rows] = saveScoresMock.mock.calls[0]
    expect(sheetId).toBe('ms-1')
    expect(rows[0]).toMatchObject({ kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 })
  })

  it('shows a soft note when the fixture records more tries than are named, and never blocks the save', async () => {
    const user = mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    // The fixture arrives with 3 tries and 1 conversion recorded; nothing named yet.
    expect(await screen.findByText('3 tries scored, 0 named')).toHaveAttribute('role', 'status')
    expect(screen.getByText('1 conversion scored, 0 named')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Player 10'), 'Harness Fly Half')
    await user.selectOptions(screen.getByLabelText('Scorer 1 kind'), 'tries')
    await user.selectOptions(screen.getByLabelText('Scorer 1 player'), '10')
    await user.clear(screen.getByLabelText('Scorer 1 how many'))
    await user.type(screen.getByLabelText('Scorer 1 how many'), '3')
    expect(screen.queryByText(/tries scored/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save draft/i }))
    await waitFor(() => expect(saveMatchSheetMock).toHaveBeenCalled())
  })

  it('a blank score produces no note', async () => {
    mount(MEN1, { ...matchFor(MEN1), tries_us: null, conversions_us: null })
    await screen.findByTestId('match-sheet-facsimile')
    // Note: not /scored, / — the block's own intro copy ("Who scored, for the
    // season stats…") legitimately contains that substring. Scope to the
    // scorers block itself, since role="status" is used elsewhere on this
    // screen (e.g. loading regions) for unrelated reasons.
    const block = screen.getByTestId('scorers-block')
    const { getByText, queryByText } = within(block)
    expect(getByText(/Who scored, for the season stats/)).toBeInTheDocument()
    expect(queryByText(/\d+ \w[\w ]* scored, \d+ named/)).not.toBeInTheDocument()
  })

  it('prefills from stored rows and keeps them in the draft', async () => {
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1', status: 'draft', league_team_id: null, league_team: null,
      slots: [{ slot: 10, player_id: 'p1', full_name: 'Harness Fly Half', front_row: false }],
      cards: [],
      scores: [{ id: 's1', kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 }],
    })
    mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    expect(await screen.findByLabelText('Scorer 1 kind')).toHaveValue('tries')
    expect(screen.getByLabelText('Scorer 1 player')).toHaveValue('10')
    expect(screen.getByLabelText('Scorer 1 how many')).toHaveValue(2)
  })
})
