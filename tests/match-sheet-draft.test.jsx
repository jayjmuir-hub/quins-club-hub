import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The RCM match sheet keeps a draft in sessionStorage — Task 4 of
// claude/plans/2026-09-02-ux-unsaved-work.md. Found by the 2 Sep 2026 UX
// review: 22 names and five card rows typed on a phone, then a back-swipe or
// a tab switch, and nothing persisted until Save draft. The sheet has no Back
// button of its own to guard, so a draft covers every exit at once.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED (CLAUDE.md rule 9). Mocks mirror
// tests/match-sheets.test.jsx. Same process zone as that file.
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
const listPlayersMock = vi.fn()
const getMatchSheetMock = vi.fn()
const saveMatchSheetMock = vi.fn()
const saveSlotsMock = vi.fn()
const saveCardsMock = vi.fn()
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
    listMatchSheetsFor: async () => new Map(),
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
const KEY = 'match-sheet-draft:e-1'

function mount() {
  useMembershipsMock.mockReturnValue({
    memberships: COACH,
    teams: [U14B],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={['/match-sheet/e-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/match-sheet/:eventId" element={<MatchSheet />} />
        <Route path="/schedule" element={<div>Schedule marker</div>} />
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
  getEventMock.mockResolvedValue(MATCH)
  listPlayersMock.mockResolvedValue([{ id: 'p1', team_id: 't-u14b', full_name: 'Zara Ali' }])
  getMatchSheetMock.mockResolvedValue(null)
  listLineupsMock.mockResolvedValue([])
  saveMatchSheetMock.mockResolvedValue({
    id: 'ms-1',
    status: 'draft',
    league_team_id: 'lt-2',
    league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
  })
  saveSlotsMock.mockResolvedValue([])
  saveCardsMock.mockResolvedValue([])
  setStatusMock.mockResolvedValue({ id: 'ms-1', status: 'complete' })
})

const captainBox = () => screen.findByLabelText(/captain/i)

describe('MatchSheet — draft', () => {
  it('keeps typing in a draft and restores it on the next visit, saying so', async () => {
    const user = mount()
    await user.type(await captainBox(), 'Ari Fenwick')
    await waitFor(() =>
      expect(JSON.parse(window.sessionStorage.getItem(KEY)).fields.captain_name).toBe('Ari Fenwick'),
    )

    cleanup()
    mount()
    expect(await captainBox()).toHaveValue('Ari Fenwick')
    // Announced, not just shown: the screen has other status regions, so find
    // the sentence and check its role rather than the other way round.
    expect(screen.getByText(/restored what you typed/i)).toHaveAttribute('role', 'status')
  })

  it('writes nothing until something is typed', async () => {
    mount()
    await captainBox()
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('drops the draft once the sheet is saved', async () => {
    const user = mount()
    await user.type(await captainBox(), 'A')
    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).not.toBeNull())
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull())
  })

  it('never restores a draft over a sheet the server already has', async () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ fields: { captain_name: 'Old draft' }, slots: [], cardRows: [], score: {} }),
    )
    getMatchSheetMock.mockResolvedValue({ id: 'ms-1', status: 'draft', captain_name: 'From server', slots: [], cards: [] })
    mount()
    expect(await captainBox()).toHaveValue('From server')
    expect(screen.queryByText(/restored what you typed/i)).toBeNull()
    // And the stale draft is gone, so it cannot resurface on a later visit.
    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull())
  })
})
