import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// RCM match sheets — Project 2. The editor and the Club Youth Manager's list.
//
// PROCESS ZONE. America/New_York, like the other fixture-writing suites: the
// deadline rule and the rendered kick-off are both time-of-day facts, and a
// zone bug is invisible under a UTC runner.
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
// ⚠️ MOCKED FOR THE PROVIDER, NOT FOR THE VALUE. useMyProfile calls useAuth,
// which throws outside an AuthProvider — so the sheet cannot render at all
// without this, and every unrelated test in this file would fail with an error
// naming auth rather than the manager prefill that pulled it in.
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
  // The completeness card on YourPlayers reads this (17 Aug 2026).
  listPlayerPrivate: async () => [],
}))
// The lineup the sheet seeds its 22 boxes from (16 Aug 2026). Mocked for the
// same reason players.js is: the real module reaches Supabase at import time.
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
import YouthDashboard from '../src/screens/YouthDashboard.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9 }
const U18B = { id: 't-u18b', club_id: CLUB, name: 'U18B Contact', sort_order: 13 }

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
const PARENT = [{ id: 'm-p', role: 'parent', status: 'active', team_id: 't-u14b', player_id: 'p1' }]
const ADMIN_YOUTH = [
  { id: 'm-a', role: 'admin', status: 'active', team_id: null, club_id: CLUB, admin_rights: ['youth'] },
]

function mount(ui, { memberships = COACH, teams = [U14B, U18B], path = '/match-sheet/e-1' } = {}) {
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
        <Route path="/admin/youth" element={ui} />
        <Route path="/schedule" element={<div>Schedule marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
  // No profile by default: the prefill is a feature and must be asked for
  // explicitly, so the tests that are not about it see empty boxes.
  useMyProfileMock.mockReturnValue({ profile: null, firstName: '' })
  upsertEventMock.mockImplementation(async (patch) => ({ ...patch }))
  getEventMock.mockResolvedValue(MATCH)
  listPlayersMock.mockResolvedValue([
    { id: 'p1', team_id: 't-u14b', full_name: 'Zara Ali' },
    { id: 'p2', team_id: 't-u14b', full_name: 'Tom Fletcher' },
  ])
  getMatchSheetMock.mockResolvedValue(null)
  // ⚠️ NO LINEUP BY DEFAULT. The seeding is a feature and must be asked for
  // explicitly, exactly like the manager prefill above — every test that is not
  // about it must still see 22 empty boxes, or a name appearing on the form
  // would stop being evidence of anything.
  listLineupsMock.mockResolvedValue([])
  listMatchSheetsForMock.mockResolvedValue(new Map())
  // ⚠️ THE EMBED IS PART OF THE RETURN because saveMatchSheet asks for it. A
  // mock that omits it would blank the TEAM line on save and no test would say
  // why — which is the exact failure the embed was added to prevent.
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

// Task 6 — the match sheet sizes itself from the fixture's format, instead of
// always offering 22 named slots. claude/plans/2026-09-02-fixture-format.md.
//
// ⚠️ THE ACCESSIBLE NAME OF A SLOT'S NAME INPUT IS `Player N`, SET IN
// MatchSheetEntry.jsx, NOT IN SlotCells — SlotCells (in MatchSheet.jsx) draws
// the facsimile's name cell as a plain <span>, which is never a control (see
// that file's own comment on why the editable branch was removed). The
// editable input lives beside the facsimile in MatchSheetEntry, already
// carries an accessible name, and every existing test already queries it that
// way (`getByLabelText('Player 1')`) — so this suite matches THAT name rather
// than inventing a new one and quietly breaking every one of those.
// ⚠️ `competition_type: 'league'`, NOT 'tournament' — the brief's first draft of
// this fixture used 'tournament', and matchSheetApplies() (src/lib/matchSheetDeadline.js)
// gates the whole screen to league matches only, tournaments included, so that
// version never reached the slot-count logic this test exists to check; it hit
// "No RCM sheet for this fixture" regardless of what MatchSheet.jsx did with the
// format. The `competition` field is dropped with it — the COMPETITION line
// reads `round` for a league fixture, not `competition`, which MATCH already
// supplies.
// ⚠️ THIS FIXTURE IS DELIBERATELY A ROW THE DATABASE REFUSES. It is a
// `competition_type: 'league'` row carrying `format: 7`, and the
// `events_league_is_fifteen` CHECK forbids exactly that combination in
// production — a league row must be 15. It is written this way here only
// because matchSheetApplies() admits league fixtures alone (see the comment
// above), and that is the sole path that reaches the sizing code this test
// exists to check. So the resizing this suite proves is UNREACHABLE in
// production today, pending the open question of whether RCM tournaments
// get a match sheet at all (open question, 2 Sep 2026).
const SEVENS = {
  ...MATCH,
  id: 'e-7',
  team_id: 't-u18b',
  team: U18B,
  format: 7,
}

describe('match sheet slot count follows the fixture format', () => {
  it('a 7s fixture renders 12 named slots, not 22', async () => {
    getEventMock.mockResolvedValue(SEVENS)
    listPlayersMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    getMatchSheetMock.mockResolvedValue(null)
    mount(<MatchSheet />, { path: '/match-sheet/e-7', memberships: [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u18b' }] })
    await screen.findAllByText(/Dubai Exiles/)
    const nameBoxes = screen.getAllByRole('combobox', { name: /^player \d+$/i })
    expect(nameBoxes).toHaveLength(12)
  })

  it('CONTROL: a fixture with no format still renders all 22', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: null })
    listPlayersMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    getMatchSheetMock.mockResolvedValue(null)
    mount(<MatchSheet />)
    await screen.findAllByText(/Dubai Exiles/)
    expect(screen.getAllByRole('combobox', { name: /^player \d+$/i })).toHaveLength(22)
  })

  it('a sheet saved with 22 rows on a fixture later made 10s keeps rows 16-22 and labels them', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: 10 })
    listPlayersMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    getMatchSheetMock.mockResolvedValue({
      id: 'sheet-1', event_id: 'e-1', status: 'draft',
      slots: Array.from({ length: 22 }, (_, i) => ({ slot: i + 1, player_id: null, full_name: `Harness Player ${i + 1}`, front_row: false })),
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByDisplayValue('Harness Player 22')
    expect(screen.getByText(/beyond the 15 allowed/i)).toBeInTheDocument()
    // CONTROL: the note is absent when nothing is beyond the limit.
    cleanup()
    getMatchSheetMock.mockResolvedValue({
      id: 'sheet-2', event_id: 'e-1', status: 'draft',
      slots: [{ slot: 1, player_id: null, full_name: 'Harness Player 1', front_row: false }],
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByDisplayValue('Harness Player 1')
    expect(screen.queryByText(/beyond the/i)).toBeNull()
  })
})
