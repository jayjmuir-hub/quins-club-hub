import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The allocation grid — pitches down the side, the day across the top.
//
// ⚠️ THE INTERESTING CASES ARE ALL ABOUT WHAT WOULD BE INVISIBLE. A grid is a
// confident-looking thing: it renders cleanly whether or not it is showing you
// everything, so every test here is really asking "would this fixture have
// disappeared?"

const listEventsMock = vi.fn()
const listPitchesMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listEvents: (...a) => listEventsMock(...a),
  subscribeEvents: () => () => {},
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// ⚠️ HOISTED `vi.mock`, NOT `vi.doMock` INSIDE THE TEST — and this file shipped
// the wrong one first. The original mocked pitches.js with vi.doMock and then
// re-imported the screen, which happened to re-evaluate the module on Windows
// and did NOT in CI: every screen test passed on this machine and all five
// failed on Linux, because the real listPitches ran and reached for Supabase.
//
// `importActual` keeps findPitchClashes and PITCH_TBD real, which matters: the
// clash exemptions are the part worth testing, and a stubbed clash detector
// would only be testing the stub.
// ⚠️ MOCKED BECAUSE AN UNMOCKED DATA MODULE MAKES A REAL NETWORK CALL, and
// that is environment-dependent in a way that is invisible here. CI sets
// PLACEHOLDER Supabase env vars, so the client constructs happily and then
// tries to reach placeholder.supabase.co: locally DNS fails instantly and the
// `.catch` runs, in CI it does not resolve fast enough and Promise.all never
// settles — so the screen sits in `loading` and every query fails with
// "unable to find an element". Green here, red on Linux, twice.
vi.mock('../src/data/pitchRequests.js', () => ({
  listPitchRequests: () => Promise.resolve([]),
  allocatePitch: () => Promise.resolve({}),
  declinePitch: () => Promise.resolve({}),
}))

vi.mock('../src/data/pitches.js', async () => {
  const actual = await vi.importActual('../src/data/pitches.js')
  return { ...actual, listPitches: (...a) => listPitchesMock(...a) }
})

const mod = await import('../src/screens/Allocation.jsx')
const Allocation = mod.default
const { hourRange, rowsFor } = mod

const TEAMS = [{ id: 't1', name: 'U16B Contact' }, { id: 't2', name: 'U14B Contact' }]

const ev = (over = {}) => ({
  id: 'e1',
  team_id: 't1',
  type: 'match',
  title: 'Match',
  starts_at: '2026-09-05T05:00:00Z', // 09:00 Abu Dhabi
  ends_at: '2026-09-05T06:30:00Z',
  pitch: 'A1',
  ...over,
})

const pitch = (name, extra = {}) => ({ id: `p-${name}`, name, is_active: true, ...extra })

beforeEach(() => {
  listEventsMock.mockReset().mockResolvedValue([ev()])
  listPitchesMock.mockReset()
  useMembershipsMock.mockReset().mockReturnValue({
    memberships: [{ role: 'admin', status: 'active', admin_rights: ['pitches'] }],
    teams: TEAMS,
  })
})

describe('hourRange', () => {
  it('spans from the earliest start to the hour containing the latest finish', () => {
    // ⚠️ Derived, not fixed. A fixed 08:00-20:00 grid silently drops a 07:00
    // kick-off — the fixture exists, is allocated, and simply does not appear.
    expect(
      hourRange([
        ev({ starts_at: '2026-09-05T05:00:00Z', ends_at: '2026-09-05T06:30:00Z' }), // 09:00-10:30
        ev({ starts_at: '2026-09-05T08:00:00Z', ends_at: '2026-09-05T09:00:00Z' }), // 12:00-13:00
      ]),
    ).toEqual([9, 10, 11, 12, 13])
  })

  it('gives a single hour its own column', () => {
    expect(hourRange([ev({ ends_at: null })])).toEqual([9])
  })

  it('returns nothing for a day with nothing on', () => {
    expect(hourRange([])).toEqual([])
  })
})

describe('rowsFor', () => {
  it('lists the active pitches', () => {
    expect(rowsFor([pitch('A1'), pitch('A2')], []).map((r) => r.name)).toEqual(['A1', 'A2'])
  })

  it('leaves a retired pitch out when nothing is on it', () => {
    expect(rowsFor([pitch('A1'), pitch('A3', { is_active: false })], []).map((r) => r.name)).toEqual(['A1'])
  })

  it('⚠️ INCLUDES A RETIRED PITCH THAT HAS A FIXTURE ON IT', () => {
    // Otherwise the booking vanishes from the one screen whose job is to show
    // what is booked — the fixture still exists and still clashes, invisibly.
    const rows = rowsFor([pitch('A1'), pitch('A3', { is_active: false })], [ev({ pitch: 'A3' })])
    expect(rows.map((r) => r.name)).toEqual(['A1', 'A3'])
    expect(rows.find((r) => r.name === 'A3').is_active).toBe(false)
  })

  it('⚠️ INCLUDES A PITCH THAT IS NOT IN THE LIST AT ALL', () => {
    // Sixteen seeded fixtures still name pitches outside the list, and
    // `events.pitch` is free text, so this is not hypothetical.
    const rows = rowsFor([pitch('A1')], [ev({ pitch: 'Clubhouse lawn' })])
    expect(rows.map((r) => r.name)).toEqual(['A1', 'Clubhouse lawn'])
    expect(rows.find((r) => r.name === 'Clubhouse lawn').unlisted).toBe(true)
  })

  it('never makes a row for Pitch TBD or for no pitch', () => {
    const rows = rowsFor([pitch('A1')], [ev({ pitch: 'Pitch TBD' }), ev({ id: 'e2', pitch: null })])
    expect(rows.map((r) => r.name)).toEqual(['A1'])
  })

  it('does not duplicate a pitch named by several fixtures', () => {
    const rows = rowsFor([], [ev({ pitch: 'Z9' }), ev({ id: 'e2', pitch: 'Z9' })])
    expect(rows).toHaveLength(1)
  })
})

describe('the screen', () => {
  async function setup() {
    listPitchesMock.mockResolvedValue([pitch('A1'), pitch('A2')])
    render(<Allocation />)
    return userEvent.setup()
  }

  it('⚠️ asks for ONE DAY, not everything', async () => {
    await setup()
    await waitFor(() => expect(listEventsMock).toHaveBeenCalled())
    // ⚠️ Explicit, because the alternative failure is silent: if the pitches
    // mock ever stops applying, the real module reaches for Supabase and every
    // screen test below fails with "unable to find an element" — five
    // confusing failures instead of one that names the cause. That is exactly
    // how this file failed in CI while passing here.
    expect(listPitchesMock, 'the pitches module is not mocked').toHaveBeenCalled()
    const args = listEventsMock.mock.calls[0][0]
    expect(args.from).toBeTruthy()
    expect(args.to).toBeTruthy()
    // A day, not a season.
    expect(Date.parse(args.to) - Date.parse(args.from)).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('⚠️ says so in a sentence when the day is empty, rather than drawing a blank grid', async () => {
    // It opens on TODAY (Jay's call) and today is often a quiet Tuesday.
    // Fifteen empty rows read as the app failing to load.
    listEventsMock.mockResolvedValue([])
    await setup()
    expect(await screen.findByText(/nothing on today/i)).toBeInTheDocument()
    expect(screen.queryByTestId('allocation-grid')).not.toBeInTheDocument()
  })

  it('draws a booking on its pitch', async () => {
    await setup()
    expect(await screen.findByTestId('allocation-grid')).toBeInTheDocument()
    expect(await screen.findByTestId('booking')).toHaveTextContent('U16B Contact')
  })

  it('⚠️ marks a clash, and counts it once rather than twice', async () => {
    listEventsMock.mockResolvedValue([
      ev({ id: 'a', starts_at: '2026-09-05T05:00:00Z', ends_at: '2026-09-05T07:00:00Z' }),
      ev({ id: 'b', team_id: 't2', starts_at: '2026-09-05T06:00:00Z', ends_at: '2026-09-05T08:00:00Z' }),
    ])
    await setup()
    expect(await screen.findAllByTestId('booking-clash')).toHaveLength(2)
    expect(screen.getByText(/1 clash/)).toBeInTheDocument()
  })

  it('⚠️ LISTS THE FIXTURES WITH NO PITCH — they appear in no row', async () => {
    // The whole reason the grid exists. Without this list the emptier the grid
    // looks, the more work there actually is.
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD' }), ev()])
    await setup()
    const waiting = await screen.findAllByTestId('unallocated')
    expect(waiting).toHaveLength(1)
    expect(screen.getByText(/1 without a pitch/)).toBeInTheDocument()
  })

  it('moves a day at a time and can come back to today', async () => {
    const user = await setup()
    await screen.findByTestId('allocation-grid')
    const before = listEventsMock.mock.calls.length

    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(listEventsMock.mock.calls.length).toBeGreaterThan(before))
    expect(await screen.findByRole('button', { name: /^today$/i })).toBeInTheDocument()
  })

  it('says "not your job" without the right', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ role: 'admin', status: 'active', admin_rights: [] }],
      teams: TEAMS,
    })
    await setup()
    expect(await screen.findByText(/Pitch Management hasn't been added to your account/i)).toBeInTheDocument()
  })
})
