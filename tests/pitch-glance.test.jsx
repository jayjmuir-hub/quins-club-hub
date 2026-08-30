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

// shareKey stays REAL (importActual), so the approved-key seeding below matches
// the cohort findPitchClashes produces; the read is mocked so no Supabase call.
const listShareApprovalKeysMock = vi.fn(() => Promise.resolve(new Set()))
vi.mock('../src/data/pitchShareApprovals.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listShareApprovalKeys: (...args) => listShareApprovalKeysMock(...args) }
})

import PitchGlance from '../src/screens/PitchGlance.jsx'
import { shareKey } from '../src/data/pitchShareApprovals.js'

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
  listShareApprovalKeysMock.mockResolvedValue(new Set())
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

describe('the occupancy panel', () => {
  // A share row at a given hour, on one pitch, with the given squad+portion pairs.
  function share(hour, pitch, members) {
    const start = new Date()
    start.setUTCHours(hour, 0, 0, 0)
    const ends_at = new Date(start.getTime() + 90 * 60000).toISOString()
    return members.map((m, i) => ({
      id: `${pitch}-${i}`,
      team_id: `t-${i}`,
      team_name: m.squad,
      type: 'training',
      pitch,
      group_id: null,
      pitch_portion: m.portion,
      starts_at: start.toISOString(),
      ends_at,
    }))
  }

  it('shows a shared pitch that FITS as room used and room free', async () => {
    listPitchOccupancyMock.mockResolvedValue(
      share(16, 'C1', [
        { squad: 'U8 Tag', portion: 'quarter' },
        { squad: 'U10 Reds', portion: 'half' },
      ]),
    )
    renderScreen()
    const panel = await screen.findByTestId('pitch-occupancy')
    const row = within(panel).getByTestId('share-row')
    expect(row).toHaveTextContent('C1')
    expect(row).toHaveTextContent('U8 Tag')
    expect(row).toHaveTextContent('U10 Reds')
    // ¼ + ½ = ¾ of a pitch, a quarter spare.
    expect(row).toHaveTextContent(/three quarters used/i)
    expect(row).toHaveTextContent(/a quarter free/i)
  })

  it('⚠️ speaks thirds, not the nearest quarter', async () => {
    // Two thirds sharing a pitch: ⅓ + ⅓ = ⅔ used, ⅓ free. The old fractionWord
    // rounded to quarters and would have said "a half used · a half free" — a
    // third is 0.333, which rounds to a quarter, not a half, either way it lied.
    listPitchOccupancyMock.mockResolvedValue(
      share(16, 'C1', [
        { squad: 'U9 Reds', portion: 'third' },
        { squad: 'U9 Blues', portion: 'third' },
      ]),
    )
    renderScreen()
    const panel = await screen.findByTestId('pitch-occupancy')
    const row = within(panel).getByTestId('share-row')
    expect(row).toHaveTextContent(/two thirds used/i)
    expect(row).toHaveTextContent(/a third free/i)
  })

  it('marks an overflowing share as over, and never shows a fan-out as a share', async () => {
    // The default rows: D2 is two full-pitch matches (over); A1 is a fan-out.
    renderScreen()
    const panel = await screen.findByTestId('pitch-occupancy')
    const over = within(panel).getByTestId('share-row-over')
    expect(over).toHaveTextContent('D2')
    expect(over).toHaveTextContent(/over by/i)
    // Exactly one share row — the A1 fan-out is one occupant, not a share.
    expect(within(panel).queryAllByTestId('share-row')).toHaveLength(0)
    expect(within(panel).getAllByTestId('share-row-over')).toHaveLength(1)
    expect(panel).not.toHaveTextContent('A1')
  })

  it('is absent when no pitch is shared', async () => {
    // A single booking on a pitch — nothing to share.
    listPitchOccupancyMock.mockResolvedValue(share(16, 'C1', [{ squad: 'U8 Tag', portion: 'quarter' }]))
    renderScreen()
    await screen.findByTestId('pitch-week')
    expect(screen.queryByTestId('pitch-occupancy')).not.toBeInTheDocument()
  })

  it('an approved overload reads as resolved and its clash markers clear', async () => {
    // The default D2 pair is the overload; approve it by key.
    const rows = occupancyRows()
    const d2 = rows.filter((r) => r.pitch === 'D2')
    listShareApprovalKeysMock.mockResolvedValue(new Set([shareKey(d2)]))
    renderScreen()

    const panel = await screen.findByTestId('pitch-occupancy')
    expect(within(panel).getByText(/Sharing approved/i)).toBeInTheDocument()
    // Read-only screen: no approve/undo control for staff.
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument()

    // The calendar agrees: the D2 entries are no longer marked as clashes.
    const week = await screen.findByTestId('pitch-week')
    expect(within(week).queryAllByTestId('week-entry-clash')).toHaveLength(0)
  })
})
