import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Resolves to the REAL shareKey (the mock below spreads importActual).
import { shareKey } from '../src/data/pitchShareApprovals.js'

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

// Same reason as the mocks above: unmocked, this reaches Supabase. shareKey
// stays REAL — the panel and the clash filter key on it, and a stubbed key
// would only test the stub.
const listShareApprovalKeysMock = vi.fn(() => Promise.resolve(new Set()))
const approveShareMock = vi.fn(() => Promise.resolve({}))
const unapproveShareMock = vi.fn(() => Promise.resolve())
vi.mock('../src/data/pitchShareApprovals.js', async () => {
  const actual = await vi.importActual('../src/data/pitchShareApprovals.js')
  return {
    ...actual,
    listShareApprovalKeys: (...a) => listShareApprovalKeysMock(...a),
    approveShare: (...a) => approveShareMock(...a),
    unapproveShare: (...a) => unapproveShareMock(...a),
  }
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
  listShareApprovalKeysMock.mockReset().mockResolvedValue(new Set())
  approveShareMock.mockReset().mockResolvedValue({})
  unapproveShareMock.mockReset().mockResolvedValue()
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

  // ⚠️ THE SCREEN OPENS ON WEEK SINCE 30 Aug 2026 (Jay's call, replacing the
  // 12 Aug month default). Every test below that exercises the pitches x hours
  // GRID has to get there first — they are not testing the default, they are
  // testing the grid, and conflating the two is how a default change turns into
  // a fistful of confusing failures.
  async function openDay(user) {
    await user.click(await screen.findByRole('tab', { name: 'Day' }))
  }

  it('⚠️ opens on the WEEK, anchored on today', async () => {
    // Jay's call, 30 Aug 2026 — the week is the planning horizon this screen is
    // opened for. Supersedes the 12 Aug month default; see the header of
    // src/screens/Allocation.jsx.
    await setup()
    expect(await screen.findByTestId('pitch-week')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
  })

  it('⚠️ Week → Day opens the FIRST day of that week, not the last', async () => {
    // The bug (Jay, 30 Aug 2026): paging weeks anchors `day` on the week's LAST
    // day — paging shifts `day` by 7 from today, which can be a Sunday — so
    // switching to Day jumped there. It must land on the week's Monday instead.
    const user = await setup()
    await screen.findByTestId('pitch-week')
    // Page to a different week first so "today" cannot coincide with the Monday.
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('tab', { name: 'Day' }))
    // The week starts on Monday, so the day heading names a Monday whatever the
    // date — that is the whole point: first day, deterministically.
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/Monday/)
  })

  it('⚠️ a month view asks for the WHOLE month, not one day', async () => {
    // The fetch window follows the view. If it did not, the month grid would
    // render six empty weeks around a single populated day and look broken.
    // The screen opens on Week now, so switch to Month first and read the LAST
    // fetch — the month's window.
    const user = await setup()
    await user.click(await screen.findByRole('tab', { name: 'Month' }))
    await waitFor(() => expect(listEventsMock).toHaveBeenCalled())
    const args = listEventsMock.mock.calls.at(-1)[0]
    const span = Date.parse(args.to) - Date.parse(args.from)
    expect(span).toBeGreaterThan(27 * 24 * 60 * 60 * 1000)
  })

  it('clicking a day in the month opens that day in the grid', async () => {
    const user = await setup()
    // The screen opens on Week now, so reach the month grid first.
    await user.click(await screen.findByRole('tab', { name: 'Month' }))
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
    // ⚠️ THE LAST call, not the first: the screen opens on Week and refetches
    // when the view changes, so calls[0] is the week's window, not the day's.
    const args = listEventsMock.mock.calls.at(-1)[0]
    expect(args.from).toBeTruthy()
    expect(args.to).toBeTruthy()
    // A day, not a season.
    expect(Date.parse(args.to) - Date.parse(args.from)).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('⚠️ says so in a sentence when the day is empty, rather than drawing a blank grid', async () => {
    // A quiet day is common, and fifteen empty rows read as the app failing to
    // load. Week → Day lands on the week's Monday (30 Aug 2026), which is only
    // "today" when today is a Monday — so accept either wording.
    listEventsMock.mockResolvedValue([])
    const user = await setup()
    await openDay(user)
    expect(await screen.findByText(/nothing on (today|this day)/i)).toBeInTheDocument()
    expect(screen.queryByTestId('allocation-grid')).not.toBeInTheDocument()
  })

  it('draws a booking on its pitch', async () => {
    const user = await setup()
    await openDay(user)
    expect(await screen.findByTestId('allocation-grid')).toBeInTheDocument()
    expect(await screen.findByTestId('booking')).toHaveTextContent('U16B Contact')
  })

  it('shows how much of the pitch a part-pitch booking takes', async () => {
    // Item 3 (Jay, 30 Aug 2026): the pitch is the row, so the booking carries
    // the PORTION — a half here shows "½", a whole pitch shows no tag.
    listEventsMock.mockResolvedValue([ev({ pitch_portion: 'half' })])
    const user = await setup()
    await openDay(user)
    expect(await screen.findByTestId('booking')).toHaveTextContent('½')
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
    // ⚠️ REWRITTEN 1 Sep 2026, THE FIRST TUESDAY AFTER THE 30 Aug WEEK→DAY
    // CHANGE, WHICH IS EXACTLY WHEN ITS OLD ASSUMPTION EXPIRED. Day view now
    // opens on the week's FIRST day (Jay's 30 Aug ruling, pinned by the test
    // above), so on the week's second day a single "next" click lands ON
    // today — where the Today button is CORRECTLY absent — and the old body,
    // which assumed Day opens on today and stepped once, went red. Sunday and
    // Monday runs stayed green, which is why it survived review: a
    // date-dependent assumption is invisible until the calendar reaches the
    // date that breaks it.
    //
    // ⚠️ NO FETCH-COUNT WAITS. Stepping only refetches when the day crosses
    // the query window, so waiting on listEvents is itself date-dependent —
    // the heading is what always changes.
    const user = await setup()
    await openDay(user)
    await screen.findByTestId('allocation-grid')
    const heading = () => screen.getByRole('heading', { level: 2 }).textContent

    // Step forward until the visible day is not today (at most twice: Day
    // view opens at worst one day behind today, per the week-first ruling).
    for (let i = 0; i < 2 && !screen.queryByRole('button', { name: /^today$/i }); i++) {
      const before = heading()
      await user.click(screen.getByRole('button', { name: /^next$/i }))
      await waitFor(() => expect(heading()).not.toBe(before))
    }

    // Off today: the button offers the way back…
    const todayButton = await screen.findByRole('button', { name: /^today$/i })
    await user.click(todayButton)
    // …and coming back makes it disappear, which is the "can come back"
    // half actually asserted rather than assumed.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^today$/i })).not.toBeInTheDocument(),
    )
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

    // findAll, like throughDetail: when today falls in the fixture's week the
    // event renders in BOTH the waiting list and the calendar grid, and a
    // singular findByRole throws on the duplicate (bit on 31 Aug 2026, the
    // Monday the default week view first contained 5 Sep).
    await user.click((await screen.findAllByRole('button', { name: /U16B Contact/i }))[0])
    // The details are really there — the key-value rows, not just a picker.
    expect(await screen.findByText('Age group')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /assign pitch/i }))
    await user.selectOptions(screen.getByLabelText('Pitch for this fixture'), 'A2')
    await user.click(screen.getByRole('button', { name: /save pitch/i }))

    // U16B is a full-pitch squad for a match, so the default portion rides along.
    await waitFor(() => expect(setEventPitchMock).toHaveBeenCalledWith('x', 'A2', 'full'))
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
      expect(allocatePitchMock).toHaveBeenCalledWith({ requestId: 'req-9', eventId: 'x', pitch: 'A1', portion: 'full' }),
    )
    expect(setEventPitchMock).not.toHaveBeenCalled()
  })

  it('the portion picker appears once a pitch is chosen, and its choice is written', async () => {
    listEventsMock.mockResolvedValue([ev({ id: 'x', pitch: 'Pitch TBD' })])
    const user = await setup()

    // findAll for the same reason as above — the event can appear twice.
    await user.click((await screen.findAllByRole('button', { name: /U16B Contact/i }))[0])
    await user.click(await screen.findByRole('button', { name: /assign pitch/i }))
    // Not offered until there is a pitch to split.
    expect(screen.queryByLabelText('How much of the pitch')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Pitch for this fixture'), 'A2')
    // Now it is, defaulted to a full pitch for U16B — override it to a half.
    const portion = await screen.findByLabelText('How much of the pitch')
    expect(portion).toHaveValue('full')
    await user.selectOptions(portion, 'half')
    await user.click(screen.getByRole('button', { name: /save pitch/i }))

    await waitFor(() => expect(setEventPitchMock).toHaveBeenCalledWith('x', 'A2', 'half'))
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
    // Switch view to force a refetch — the screen opens on Week now, so
    // re-clicking Week would be a no-op. Month refetches; the away twin must
    // not appear in the waiting list.
    await first.click(screen.getByRole('tab', { name: 'Month' }))
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

describe('the "it\'s fine" override', () => {
  // Two full-pitch matches on A1 at the same time — a genuine overload.
  const overload = [
    { id: 'e1', team_id: 't1', type: 'match', title: 'A', pitch: 'A1', pitch_portion: 'full', club_id: 'club-1', starts_at: '2026-09-05T05:00:00Z', ends_at: '2026-09-05T06:30:00Z' },
    { id: 'e2', team_id: 't2', type: 'match', title: 'B', pitch: 'A1', pitch_portion: 'full', club_id: 'club-1', starts_at: '2026-09-05T05:00:00Z', ends_at: '2026-09-05T06:30:00Z' },
  ]

  it('an admin approves an overload, and it writes the exact share', async () => {
    listPitchesMock.mockResolvedValue([pitch('A1')])
    listEventsMock.mockResolvedValue(overload)
    const user = userEvent.setup()
    render(<Allocation />)

    const panel = await screen.findByTestId('pitch-occupancy')
    const row = within(panel).getByTestId('share-row-over')
    expect(row).toHaveTextContent(/over by/i)

    await user.click(within(row).getByRole('button', { name: /approve/i }))

    await waitFor(() => expect(approveShareMock).toHaveBeenCalledTimes(1))
    const passed = approveShareMock.mock.calls[0][0]
    expect(passed.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
  })

  it('an already-approved overload reads as resolved, with an Undo, not a clash', async () => {
    // Approving here also clears the grid marker: `clashing` skips any cohort
    // whose shareKey is approved (proven directly in the pitch-glance suite).
    listPitchesMock.mockResolvedValue([pitch('A1')])
    listEventsMock.mockResolvedValue(overload)
    listShareApprovalKeysMock.mockResolvedValue(new Set([shareKey(overload)]))
    render(<Allocation />)

    const panel = await screen.findByTestId('pitch-occupancy')
    expect(within(panel).getByText(/Sharing approved/i)).toBeInTheDocument()
    expect(within(panel).queryByText(/over by/i)).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })
})
