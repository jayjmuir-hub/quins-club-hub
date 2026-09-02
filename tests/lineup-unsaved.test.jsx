import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The team sheet says when it is unsaved and asks before Back — Task 3 of
// claude/plans/2026-09-02-ux-unsaved-work.md. Found by the 2 Sep 2026 UX
// review: Save is at the foot of the whole squad list and Back was a bare
// navigate(-1), so a coach who had placed fifteen shirts and swiped back lost
// the lot.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED (CLAUDE.md rule 9). Mocks mirror
// tests/lineup.test.jsx, with navigate captured so Back can be asserted.

const useMembershipsMock = vi.fn()
const getEventMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityMock = vi.fn()
const listLineupsMock = vi.fn()
const createLineupMock = vi.fn()
const updateLineupMock = vi.fn()
const saveLineupPlayersMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useParams: () => ({ eventId: 'e-1' }),
  useNavigate: () => navigateMock,
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
vi.mock('../src/lib/shareImage.js', () => ({ shareElementAsImage: vi.fn() }))
vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: vi.fn(async () => new Map()),
  listPlayerPositions: vi.fn(async () => new Map()),
}))

import Lineup from '../src/screens/Lineup.jsx'

const TEAM = { id: 't-u16b', club_id: 'c-1', name: 'U16B Contact' }
const EVENT = {
  id: 'e-1',
  team_id: TEAM.id,
  type: 'match',
  opponent: 'Dubai Exiles',
  starts_at: '2026-10-10T04:00:00.000Z',
}
const COACH = [{ id: 'm-1', role: 'coach', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]
const PLAYERS = [
  { id: 'p-in', full_name: 'Rory Aldenbrook', team_id: TEAM.id },
  { id: 'p-maybe', full_name: 'Callum Whitstead', team_id: TEAM.id },
]

function renderScreen() {
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: [TEAM], loading: false, error: null })
  getEventMock.mockResolvedValue(EVENT)
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAvailabilityMock.mockResolvedValue([
    { player_id: 'p-in', status: 'in' },
    { player_id: 'p-maybe', status: 'maybe' },
  ])
  listLineupsMock.mockResolvedValue([])
  render(<Lineup />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
})

const back = () => screen.getByRole('button', { name: /^back$/i })

describe('Lineup — unsaved changes', () => {
  it('Back leaves at once when nothing changed', async () => {
    const user = renderScreen()
    await screen.findByText('Rory Aldenbrook')
    expect(screen.queryByText(/unsaved changes/i)).toBeNull()
    await user.click(back())
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('marks the sheet unsaved after a pick and asks before leaving', async () => {
    const user = renderScreen()
    await screen.findByText('Rory Aldenbrook')
    await user.click(screen.getAllByRole('button', { name: /^start$/i })[0])
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()

    await user.click(back())
    expect(navigateMock).not.toHaveBeenCalled()
    const ask = await screen.findByRole('alertdialog', { name: /leave without saving/i })
    await user.click(within(ask).getByRole('button', { name: /^stay$/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()

    await user.click(back())
    const again = await screen.findByRole('alertdialog', { name: /leave without saving/i })
    await user.click(within(again).getByRole('button', { name: /^leave$/i }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('clears the marker after a save', async () => {
    createLineupMock.mockResolvedValue({ id: 'l-1' })
    saveLineupPlayersMock.mockResolvedValue([])
    const user = renderScreen()
    await screen.findByText('Rory Aldenbrook')
    await user.click(screen.getAllByRole('button', { name: /^start$/i })[0])
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByText('Saved')
    expect(screen.queryByText(/unsaved changes/i)).toBeNull()
  })
})

// The draft (2 Sep 2026): the follow-up item 1 left open. The dock and the
// sidebar are plain links with no route blocker, so a coach who tapped one
// with fifteen shirts placed lost the lot. Same shape as the match sheet's.
describe('Lineup — the draft', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('a pick is written to sessionStorage, and comes back on a fresh open when the server has nothing', async () => {
    const user = renderScreen()
    await screen.findAllByText('Rory Aldenbrook')
    expect(window.sessionStorage.getItem('lineup-draft:e-1')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: /^start$/i })[0])
    const raw = window.sessionStorage.getItem('lineup-draft:e-1')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw).slotted).toContain('p-in')

    // Leave by any route at all — the component simply unmounts — and open
    // the sheet again from cold.
    cleanup()
    renderScreen()
    await screen.findAllByText('Rory Aldenbrook')
    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument()
    // The shirt is back where it was: the player is no longer offered as
    // a bench candidate to start.
    expect(screen.getAllByRole('button', { name: /^start$/i }).length).toBe(1)
  })

  it('⚠️ a lineup the server has wins, and the stale draft is thrown away', async () => {
    window.sessionStorage.setItem('lineup-draft:e-1', JSON.stringify({ slotted: ['p-maybe'], reps: [] }))
    useMembershipsMock.mockReturnValue({ memberships: COACH, teams: [TEAM], loading: false, error: null })
    getEventMock.mockResolvedValue(EVENT)
    listPlayersMock.mockResolvedValue(PLAYERS)
    listAvailabilityMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([{
      id: 'l-1', players_per_side: 15, squad_size: null, notes: '',
      lineup_players: [{ player_id: 'p-in', role: 'starter', position: null, sort_order: 0 }],
    }])
    render(<Lineup />)
    await screen.findAllByText('Rory Aldenbrook')
    expect(screen.queryByText(/unsaved changes/i)).toBeNull()
    expect(window.sessionStorage.getItem('lineup-draft:e-1')).toBeNull()
  })

  it('a save clears the draft', async () => {
    createLineupMock.mockResolvedValue({ id: 'l-1' })
    saveLineupPlayersMock.mockResolvedValue([])
    const user = renderScreen()
    await screen.findAllByText('Rory Aldenbrook')
    await user.click(screen.getAllByRole('button', { name: /^start$/i })[0])
    expect(window.sessionStorage.getItem('lineup-draft:e-1')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByText('Saved')
    expect(window.sessionStorage.getItem('lineup-draft:e-1')).toBeNull()
  })
})
