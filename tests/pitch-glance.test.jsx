import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// /pitch-calendar — the read-only club-wide booking view for squad staff.
//
// ⚠️ WHAT MATTERS HERE:
//   - the gate offers the page to staff/admins only, and never fetches for
//     anyone else;
//   - a genuine same-pitch overlap is MARKED as a clash while a fanned-out
//     multi-squad session sharing a group_id is NOT — the exemption that
//     makes the calendar readable at all;
//   - entries are labelled with the squad's name (the redacted rows carry
//     nothing else to label with).

const listPitchOccupancyMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/pitches.js', async (importOriginal) => {
  // findPitchClashes and PITCH_TBD stay REAL — the clash exemption under test
  // is theirs, and a stub of it would prove only that the stub was called.
  const actual = await importOriginal()
  return {
    ...actual,
    listPitchOccupancy: (...args) => listPitchOccupancyMock(...args),
  }
})
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

import PitchGlance from '../src/screens/PitchGlance.jsx'

const TEAMS = [
  { id: 't-u12', name: 'U12 Mixed', sort_order: 3 },
  { id: 't-u14', name: 'U14B', sort_order: 5 },
]
const COACH = [{ role: 'coach', team_id: 't-u12', status: 'active' }]
const PARENT = [{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }]

// All rows sit at 08:00/16:00 UTC TODAY, so they land inside the week the
// screen opens on regardless of which weekday the suite runs.
function occupancyRows() {
  const at = (hour, minutes = 90) => {
    const start = new Date()
    start.setUTCHours(hour, 0, 0, 0)
    return {
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + minutes * 60000).toISOString(),
    }
  }
  return [
    // The genuine clash: two squads, same pitch, same hour, no shared group.
    { id: 'o1', team_id: 't-u12', team_name: 'U12 Mixed', type: 'match', pitch: 'D2', group_id: null, ...at(8) },
    { id: 'o2', team_id: 't-u14', team_name: 'U14B', type: 'match', pitch: 'D2', group_id: null, ...at(8) },
    // The fan-out: same pitch, same hour, SHARED group_id — not a clash.
    { id: 'o3', team_id: 't-u12', team_name: 'U12 Mixed', type: 'training', pitch: 'A1', group_id: 'g1', ...at(16) },
    { id: 'o4', team_id: 't-u14', team_name: 'U14B', type: 'training', pitch: 'A1', group_id: 'g1', ...at(16) },
  ]
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <PitchGlance />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: TEAMS, loading: false })
  listPitchOccupancyMock.mockResolvedValue(occupancyRows())
})

describe('the gate', () => {
  it('turns a parent away and never fetches', async () => {
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: TEAMS, loading: false })
    renderScreen()
    expect(await screen.findByText(/pitch calendar is for squad staff/i)).toBeInTheDocument()
    expect(listPitchOccupancyMock).not.toHaveBeenCalled()
  })
})

describe('the week', () => {
  it('marks the genuine same-pitch overlap and NOT the shared-group fan-out', async () => {
    renderScreen()
    const week = await screen.findByTestId('pitch-week')
    const clashes = within(week).getAllByTestId('week-entry-clash')
    expect(clashes).toHaveLength(2)
    for (const entry of clashes) expect(entry).toHaveTextContent('D2')
    // The A1 fan-out pair renders as plain entries.
    const plain = within(week).getAllByTestId('week-entry')
    expect(plain).toHaveLength(2)
    for (const entry of plain) expect(entry).toHaveTextContent('A1')
  })

  it('labels entries with the squad name — the only name the redacted row has', async () => {
    renderScreen()
    const week = await screen.findByTestId('pitch-week')
    expect(within(week).getAllByText('U12 Mixed').length).toBeGreaterThanOrEqual(1)
    expect(within(week).getAllByText('U14B').length).toBeGreaterThanOrEqual(1)
  })

  it('says so when nothing is booked', async () => {
    listPitchOccupancyMock.mockResolvedValue([])
    renderScreen()
    expect(await screen.findByText(/Nothing booked in this stretch/i)).toBeInTheDocument()
  })

  it('a failed read shows the error line, not a blank page', async () => {
    listPitchOccupancyMock.mockRejectedValue(new Error('nope'))
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong/i)
  })
})
