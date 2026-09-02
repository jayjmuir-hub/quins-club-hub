import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Task 7: a new lineup opens at the fixture's format — claude/plans/2026-09-02-fixture-format.md.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9: this repo is public
// and its members are mostly children. The SHAPES are what matter, and made-up
// names reproduce those exactly.
//
// Mock block and mount helper copied verbatim from tests/lineup.test.jsx.

const useMembershipsMock = vi.fn()
const getEventMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityMock = vi.fn()
const listLineupsMock = vi.fn()
const createLineupMock = vi.fn()
const updateLineupMock = vi.fn()
const saveLineupPlayersMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useParams: () => ({ eventId: 'e-1' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ getEvent: (...a) => getEventMock(...a) }))
vi.mock('../src/data/players.js', () => ({ listPlayers: (...a) => listPlayersMock(...a) }))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...a) => listAvailabilityMock(...a),
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
  createLineup: (...a) => createLineupMock(...a),
  updateLineup: (...a) => updateLineupMock(...a),
  saveLineupPlayers: (...a) => saveLineupPlayersMock(...a),
  deleteLineup: vi.fn(),
}))
// html2canvas is lazily imported by the share path and never reached here.
vi.mock('../src/lib/shareImage.js', () => ({ shareElementAsImage: vi.fn() }))
// ⚠️ MOCKED TO KEEP THIS FILE HERMETIC, NOT BECAUSE ANYTHING HERE READS A GRADE.
// The eligibility warning made Lineup import playerTiers, and the screen swallows
// that read's failure by design — so without this mock the suite still PASSED
// while making a real Supabase request per test and paying for the timeout. Grades
// themselves are tested in tests/lineup-eligibility.test.jsx.
vi.mock('../src/data/playerTiers.js', () => ({ listPlayerGrades: vi.fn(async () => new Map()), listPlayerPositions: vi.fn(async () => new Map()) }))

import Lineup from '../src/screens/Lineup.jsx'

const TEAM = { id: 't-u16b', club_id: 'c-1', name: 'U16B Contact' }
const MATCH = { id: 'e-1', team_id: TEAM.id, type: 'match', opponent: 'Dubai Exiles', starts_at: '2026-10-10T04:00:00.000Z' }
const COACH = [{ id: 'm-1', role: 'coach', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]

const PLAYERS = [
  { id: 'p-in', full_name: 'Rory Aldenbrook', team_id: TEAM.id },
]

function mountLineup({ memberships = COACH } = {}) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [TEAM], loading: false, error: null })
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAvailabilityMock.mockResolvedValue([{ player_id: 'p-in', status: 'in' }])
  render(<Lineup />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  createLineupMock.mockResolvedValue({ id: 'l-1' })
  saveLineupPlayersMock.mockResolvedValue([])
  updateLineupMock.mockResolvedValue({ id: 'l-1' })
})

describe('lineup players-per-side defaults from the fixture format', () => {
  it('a new lineup on a 7s fixture opens at 7-a-side', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: 7 })
    listLineupsMock.mockResolvedValue([])
    mountLineup()
    const select = await screen.findByLabelText(/players per side/i)
    expect(select).toHaveValue('7')
  })

  it('CONTROL: an existing lineup keeps its own size whatever the fixture says', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: 7 })
    listLineupsMock.mockResolvedValue([{ id: 'l-1', event_id: 'e-1', players_per_side: 10, squad_size: null, lineup_players: [] }])
    mountLineup()
    const select = await screen.findByLabelText(/players per side/i)
    expect(select).toHaveValue('10')
  })

  it('a fixture with no format opens at 15', async () => {
    getEventMock.mockResolvedValue({ ...MATCH, format: null })
    listLineupsMock.mockResolvedValue([])
    mountLineup()
    expect(await screen.findByLabelText(/players per side/i)).toHaveValue('15')
  })
})
