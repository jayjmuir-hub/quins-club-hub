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
const listPitchRequestsMock = vi.fn(() => Promise.resolve([]))
const allocatePitchMock = vi.fn(() => Promise.resolve({}))
const setEventPitchMock = vi.fn(() => Promise.resolve({}))
vi.mock('../src/data/pitchRequests.js', () => ({
  listPitchRequests: (...a) => listPitchRequestsMock(...a),
  allocatePitch: (...a) => allocatePitchMock(...a),
  declinePitch: () => Promise.resolve({}),
  setEventPitch: (...a) => setEventPitchMock(...a),
}))

// EventDetail (opened by clicking any event since the details-first change)
// renders an availability summary, which would otherwise reach for Supabase —
// same reason as the pitchRequests mock above.
vi.mock('../src/data/availability.js', () => ({
  listAvailability: () => Promise.resolve([]),
  subscribeAvailability: () => () => {},
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
  listPitchRequestsMock.mockReset().mockResolvedValue([])
  allocatePitchMock.mockReset().mockResolvedValue({})
  setEventPitchMock.mockReset().mockResolvedValue({})
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

  // ⚠️ THE SCREEN OPENS ON MONTH SINCE 12 Aug 2026 (Jay's call, replacing the
  // 11 Aug "opens on today, in Day view"). Every test below that exercises the
  // pitches x hours GRID has to get there first — they are not testing the
  // default, they are testing the grid, and conflating the two is how a
  // default change turns into five confusing failures.
  async function openDay(user) {
    await user.click(await screen.findByRole('tab', { name: 'Day' }))
  }

  it('⚠️ opens on the MONTH, anchored on today', async () => {
    // Jay asked for this directly when offered the choice. It supersedes the
    // 11 Aug ruling; see the header of src/screens/Allocation.jsx.
    await setup()
    expect(await screen.findByTestId('pitch-month')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true')
    // Anchored on TODAY: the heading is this month, not January.
    const now = new Date()
    const month = now.toLocaleDateString(undefined, { month: 'long' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(month)
  })

  it('⚠️ a month view asks for the WHOLE month, not one day', async () => {
    // The fetch window follows the view. If it did not, the month grid would
    // render six empty weeks around a single populated day and look broken.
    await setup()
    await waitFor(() => expect(listEventsMock).toHaveBeenCalled())
    const args = listEventsMock.mock.calls[0][0]
    const span = Date.parse(args.to) - Date.parse(args.from)
    expect(span).toBeGreaterThan(27 * 24 * 60 * 60 * 1000)
  })

  it('clicking a day in the month opens that day in the grid', async () => {
    const user = await setup()
    await screen.findByTestId('pitch-month')
    const cells = screen.getAllByTestId('month-cell')
    await user.click(cells[10])
    expect(await screen.findByRole('tab', { name: 'Day' })).toHaveAttribute('aria-selected', 'true')
  })

  it('⚠️ asks for ONE DAY, not everything', async () => {
    const user = await setup()
    await openDay(user)
    await waitFor(() => expect(listEventsMock).toHaveBeenCalled())
    // ⚠️ Explicit, because the alternative failure is silent: if the pitches
    // mock ever stops applying, the real module reaches for Supabase and every
    // screen test below fails with "unable to find an element" — five
    // confusing failures instead of one that names the cause. That is exactly
    // how this file failed in CI while passing here.
    expect(listPitchesMock, 'the pitches module is not mocked').toHaveBeenCalled()
    // ⚠️ THE LAST call, not the first: the screen opens on Month and refetches
    // when the view changes, so calls[0] is the month's window.
    const args = listEventsMock.mock.calls.at(-1)[0]
    expect(args.from).toBeTruthy()
    expect(args.to).toBeTruthy()
    // A day, not a season.
    expect(Date.parse(args.to) - Date.parse(args.from)).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('⚠️ says so in a sentence when the day is empty, rather than drawing a blank grid', async () => {
    // It opens on TODAY (Jay's call) and today is often a quiet Tuesday.
    // Fifteen empty rows read as the app failing to load.
    listEventsMock.mockResolvedValue([])
    const user = await setup()
    await openDay(user)
    expect(await screen.findByText(/nothing on today/i)).toBeInTheDocument()
    expect(screen.queryByTestId('allocation-grid')).not.toBeInTheDocument()
  })

  it('draws a booking on its pitch', async () => {
    const user = await setup()
    await openDay(user)
    expect(await screen.findByTestId('allocation-grid')).toBeInTheDocument()
    expect(await screen.findByTestId('booking')).toHaveTextContent('U16B Contact')
  })

  it('⚠️ marks a clash, and counts it once rather than twice', async () => {
    listEventsMock.mockResolvedValue([
      ev({ id: 'a', starts_at: '2026-09-05T05:00:00Z', ends_at: '2026-09-05T07:00:00Z' }),
      ev({ id: 'b', team_id: 't2', starts_at: '2026-09-05T06:00:00Z', ends_at: '2026-09-05T08:00:00Z' }),
    ])
    const user = await setup()
    await openDay(user)
    expect(await screen.findAllByTestId('booking-clash')).toHaveLength(2)
    expect(screen.getByText(/1 clash/)).toBeInTheDocument()
  })

  it('⚠️ LISTS THE FIXTURES WITH NO PITCH — they appear in no row', async () => {
    // The whole reason the grid exists. Without this list the emptier the grid
    // looks, the more work there actually is.
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD' }), ev()])
    const user = await setup()
    await openDay(user)
    const waiting = await screen.findAllByTestId('unallocated')
    expect(waiting).toHaveLength(1)
    expect(screen.getByText(/1 without a pitch/)).toBeInTheDocument()
  })

  it('moves a day at a time and can come back to today', async () => {
    const user = await setup()
    await openDay(user)
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

// ── Direct assignment — click an event, give it a pitch ─────────────────────
// (claude/plans/2026-08-24-pitch-direct-assign.md). Jay, 24 Aug 2026: "none of
// the events are clickable, can't click them to assign a pitch" — they never
// were; these pin that they now are, and that the two write paths stay
// straight: no request → setEventPitch, pending request → allocatePitch so
// the coach's request is closed truthfully.
describe('direct assignment', () => {
  async function setup() {
    listPitchesMock.mockResolvedValue([pitch('A1'), pitch('A2')])
    render(<Allocation />)
    return userEvent.setup()
  }

  // Details first (Jay, 24 Aug 2026): a click opens EventDetail; the picker
  // is the Assign/Change pitch button inside it.
  async function throughDetail(user, name) {
    await user.click((await screen.findAllByRole('button', { name }))[0])
    await user.click(await screen.findByRole('button', { name: /assign pitch|change pitch/i }))
  }

  it('an unallocated event opens its DETAILS, and assigning from them writes the fixture', async () => {
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD' })])
    const user = await setup()

    await user.click(await screen.findByRole('button', { name: /U16B Contact/i }))
    // The details are really there — the key-value rows, not just a picker.
    expect(await screen.findByText('Age group')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /assign pitch/i }))
    await user.selectOptions(screen.getByLabelText('Pitch for this fixture'), 'A2')
    await user.click(screen.getByRole('button', { name: /save pitch/i }))

    await waitFor(() => expect(setEventPitchMock).toHaveBeenCalledWith('x', 'A2'))
    // No request existed, so the queue path must NOT fire — a phantom
    // allocatePitch would try to close a request that is not there.
    expect(allocatePitchMock).not.toHaveBeenCalled()
  })

  it('a pending request rides along: saving answers it instead of orphaning it', async () => {
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD' })])
    listPitchRequestsMock.mockResolvedValue([
      { id: 'req-9', event_id: 'x', status: 'submitted', events: ev({ id: 'x' }) },
    ])
    const user = await setup()

    await throughDetail(user, /U16B Contact/i)
    await user.selectOptions(screen.getByLabelText('Pitch for this fixture'), 'A1')
    await user.click(screen.getByRole('button', { name: /save pitch/i }))

    await waitFor(() =>
      expect(allocatePitchMock).toHaveBeenCalledWith({ requestId: 'req-9', eventId: 'x', pitch: 'A1' }),
    )
    expect(setEventPitchMock).not.toHaveBeenCalled()
  })

  it('a booked event opens preset to its current pitch, via Change pitch', async () => {
    // The mocked listEvents returns the A1 booking for ANY window, so the
    // day grid always has exactly one booking to click — deterministic, no
    // date navigation needed.
    const user = await setup()
    await user.click(await screen.findByRole('tab', { name: 'Day' }))
    await user.click(await screen.findByTestId('booking'))
    await user.click(await screen.findByRole('button', { name: /change pitch/i }))
    expect(screen.getByLabelText('Pitch for this fixture')).toHaveValue('A1')
  })

  it('⚠️ an AWAY match never appears in "Waiting for a pitch"', async () => {
    // Somebody else's ground — no pitch of ours to give. Control first: the
    // HOME twin of the same fixture DOES appear, so an empty result below is
    // the filter working and not the list failing to render.
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD', home: true })])
    const first = await setup()
    expect(await screen.findByText('Waiting for a pitch')).toBeInTheDocument()

    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD', home: false })])
    await first.click(screen.getByRole('tab', { name: 'Week' }))
    await waitFor(() => expect(screen.queryByText('Waiting for a pitch')).not.toBeInTheDocument())
  })

  it('an AWAY booking shows its details WITHOUT an assign button', async () => {
    listEventsMock.mockResolvedValue([ev({ home: false })])
    const user = await setup()
    await user.click(await screen.findByRole('tab', { name: 'Day' }))
    await user.click(await screen.findByTestId('booking'))
    expect(await screen.findByText('Age group')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /assign pitch|change pitch/i })).not.toBeInTheDocument()
  })

  it("the waiting list shows each fixture's DATE, not just its time", async () => {
    // Jay, 24 Aug 2026: "the events don't show a date unless you click them".
    // The mocked fixture is Sat 5 Sep (Abu Dhabi); the row must say so.
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD' })])
    await setup()
    const row = await screen.findByTestId('unallocated')
    expect(row.textContent).toMatch(/Sat/)
    expect(row.textContent).toMatch(/Sep/)
  })
})
