import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// A leaver's name must survive on a saved team sheet, tagged, and must never
// be newly selectable — spec claude/specs/2026-09-02-player-leavers-design.md
// §4. Preamble copied from tests/match-sheets.test.jsx.
//
// ⚠️ EVERY NAME HERE IS INVENTED. CLAUDE.md rule 9: this repo is public and
// its members are mostly children.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const useMyProfileMock = vi.fn()
const upsertEventMock = vi.fn()
const getEventMock = vi.fn()
const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const getMatchSheetMock = vi.fn()
const listMatchSheetsForMock = vi.fn()
const saveMatchSheetMock = vi.fn()
const saveSlotsMock = vi.fn()
const saveCardsMock = vi.fn()
const setStatusMock = vi.fn()
const listLineupsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/lib/useMyProfile.js', () => ({
  default: () => useMyProfileMock(),
}))
vi.mock('../src/data/events.js', () => ({
  getEvent: (...a) => getEventMock(...a),
  listEvents: (...a) => listEventsMock(...a),
  subscribeEvents: () => () => {},
  upsertEvent: (...a) => upsertEventMock(...a),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: async () => [],
  listPlayerPrivate: async () => [],
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
  createLineup: async () => ({}),
  updateLineup: async () => ({}),
  saveLineupPlayers: async () => [],
  deleteLineup: async () => {},
}))
vi.mock('../src/data/matchSheets.js', async () => {
  const actual = await vi.importActual('../src/data/matchSheets.js')
  return {
    SLOT_COUNT: actual.SLOT_COUNT,
    getMatchSheet: (...a) => getMatchSheetMock(...a),
    listMatchSheetsFor: (...a) => listMatchSheetsForMock(...a),
    saveMatchSheet: (...a) => saveMatchSheetMock(...a),
    saveMatchSheetSlots: (...a) => saveSlotsMock(...a),
    saveMatchSheetCards: (...a) => saveCardsMock(...a),
    setMatchSheetStatus: (...a) => setStatusMock(...a),
  }
})

import MatchSheet from '../src/screens/MatchSheet.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9 }

const MATCH = {
  id: 'e-1',
  club_id: CLUB,
  team_id: 't-u14b',
  type: 'match',
  competition_type: 'league',
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City, Abu Dhabi',
  starts_at: '2026-09-12T05:00:00.000Z',
  ends_at: '2026-09-12T06:30:00.000Z',
  round: 4,
  league_team_id: 'lt-2',
  league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
  team: U14B,
}

const COACH = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u14b' }]

function mount(ui, { memberships = COACH, teams = [U14B], path = '/match-sheet/e-1' } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/match-sheet/:eventId" element={ui} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useMyProfileMock.mockReturnValue({ profile: null, firstName: '' })
  upsertEventMock.mockImplementation(async (patch) => ({ ...patch }))
  getEventMock.mockResolvedValue(MATCH)
  getMatchSheetMock.mockResolvedValue(null)
  listLineupsMock.mockResolvedValue([])
  listMatchSheetsForMock.mockResolvedValue(new Map())
  saveMatchSheetMock.mockResolvedValue({
    id: 'ms-1',
    status: 'draft',
    league_team_id: 'lt-2',
    league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
  })
  saveSlotsMock.mockResolvedValue([])
  saveCardsMock.mockResolvedValue([])
  setStatusMock.mockResolvedValue({ id: 'ms-1', status: 'complete' })
  listEventsMock.mockResolvedValue([MATCH])
})

describe('MatchSheet — leavers', () => {
  it('a leaver on a saved sheet is loaded and shown with the Left tag', async () => {
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', team_id: 't-u14b', full_name: 'Tomasz Delacroix-Obi', left_at: null },
      { id: 'p-2', team_id: 't-u14b', full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' },
    ])
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1',
      status: 'draft',
      league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
      slots: [
        { slot: 1, player_id: 'p-1', full_name: 'Tomasz Delacroix-Obi', front_row: false },
        { slot: 2, player_id: 'p-2', full_name: 'Rafiq Delacroix-Obi', front_row: false },
      ],
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    // includeLeft: a saved sheet must still name the child who has since left.
    expect(listPlayersMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: ['t-u14b'], includeLeft: true }),
    )
    const facsimile = within(screen.getByTestId('match-sheet-facsimile'))
    expect(await facsimile.findByText('Rafiq Delacroix-Obi · Left')).toBeInTheDocument()
    expect(facsimile.getByText('Tomasz Delacroix-Obi')).toBeInTheDocument()
    // The current player's name is never tagged.
    expect(facsimile.queryByText('Tomasz Delacroix-Obi · Left')).not.toBeInTheDocument()
  })

  it('never offers a leaver in the squad picker for a new slot', async () => {
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', team_id: 't-u14b', full_name: 'Tomasz Delacroix-Obi', left_at: null },
      { id: 'p-2', team_id: 't-u14b', full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' },
    ])
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    const datalist = document.getElementById('squad-players')
    const options = [...datalist.querySelectorAll('option')].map((option) => option.value)
    expect(options).toContain('Tomasz Delacroix-Obi')
    expect(options).not.toContain('Rafiq Delacroix-Obi')
  })
})
