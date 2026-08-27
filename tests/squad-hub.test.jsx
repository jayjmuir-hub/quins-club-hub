import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// /squad and /squad/:teamId — the coach/manager dashboard
// (claude/plans/2026-08-21-squad-hub.md).
//
// ⚠️ WHAT MATTERS HERE:
//   - the gate is "not your squad" and a parent-only account must meet it;
//   - a one-squad coach lands straight in their hub, no picker;
//   - the grid DISCRIMINATES: said-in-but-absent renders as a no-show while
//     said-in-and-present does not — a grid reading one table alone passes
//     neither;
//   - a minis squad's hub never asks for match sheets (U10 and below are not
//     on the RCM form — src/lib/minis.js).

const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityForEventsMock = vi.fn()
const listAttendanceForEventsMock = vi.fn()
const listMatchSheetsForMock = vi.fn()
const listNoticesMock = vi.fn()
const listMyReadsMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailabilityForEvents: (...args) => listAvailabilityForEventsMock(...args),
}))
vi.mock('../src/data/attendance.js', () => ({
  listAttendanceForEvents: (...args) => listAttendanceForEventsMock(...args),
}))
vi.mock('../src/data/matchSheets.js', () => ({
  listMatchSheetsFor: (...args) => listMatchSheetsForMock(...args),
}))
vi.mock('../src/data/announcements.js', () => ({
  listNotices: (...args) => listNoticesMock(...args),
  listMyReads: (...args) => listMyReadsMock(...args),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// The drill-in sheets are stubbed, FeedbackTriage-style: every assertion in
// this file is about the HUB's wiring — which sheet is open, with which event
// — and none should start depending on what the real sheets render. Their own
// behaviour is covered by tests/event-detail-series.test.jsx,
// tests/availability.test.jsx and the register tests.
vi.mock('../src/screens/EventDetail.jsx', () => ({
  default: ({ event, onOpenAvailability, onClose }) => (
    <div data-testid="event-detail">
      <p>detail: {event.id}</p>
      <button type="button" onClick={onOpenAvailability}>stub availability</button>
      <button type="button" onClick={onClose}>stub close</button>
    </div>
  ),
}))
vi.mock('../src/screens/Availability.jsx', () => ({
  default: ({ event }) => <div data-testid="availability-sheet">availability: {event.id}</div>,
}))
vi.mock('../src/screens/Register.jsx', () => ({
  default: ({ event }) => <div data-testid="register-sheet">register: {event.id}</div>,
}))

import SquadHub from '../src/screens/SquadHub.jsx'
import userEvent from '@testing-library/user-event'

// ⚠️ DELIBERATELY SHUFFLED — U14 before U12 despite sort_order 5 > 3. The
// picker-order test below only discriminates because array order and
// sort_order disagree; a fixture already in order would pass against the
// exact bug it exists to catch (the 21 Aug picker showing insertion order).
const TEAMS = [
  { id: 't-u14', name: 'U14B', sort_order: 5 },
  { id: 't-u12', name: 'U12 Mixed', sort_order: 3 },
  { id: 't-u8', name: 'U8 Tag', sort_order: 1 },
]

// Invented names — this repo is public and its members are mostly children.
const PLAYERS = [
  { id: 'p1', full_name: 'Ines Vukovic', team_id: 't-u12' },
  { id: 'p2', full_name: 'Tomas Aldana', team_id: 't-u12' },
]

// One past match (register taken), one future training (RSVPs open).
const PAST_MATCH = {
  id: 'e-past',
  team_id: 't-u12',
  type: 'match',
  competition_type: 'league',
  opponent: 'Sharjah',
  starts_at: '2026-08-10T08:00:00Z',
}
const FUTURE_TRAINING = {
  id: 'e-next',
  team_id: 't-u12',
  type: 'training',
  title: 'Tuesday training',
  starts_at: '2099-01-05T15:00:00Z',
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/squad" element={<SquadHub />} />
        <Route path="/squad/:teamId" element={<SquadHub />} />
      </Routes>
    </MemoryRouter>,
  )
}

function membershipsFor(rows) {
  return { memberships: rows, teams: TEAMS, loading: false }
}

beforeEach(() => {
  vi.clearAllMocks()
  listEventsMock.mockResolvedValue([PAST_MATCH, FUTURE_TRAINING])
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAvailabilityForEventsMock.mockResolvedValue([
    // p1 said in for the past match and DID NOT COME — the no-show.
    { event_id: 'e-past', player_id: 'p1', status: 'in' },
    // p2 said in and came — must NOT count.
    { event_id: 'e-past', player_id: 'p2', status: 'in' },
    // RSVPs for the upcoming training, for the chips.
    { event_id: 'e-next', player_id: 'p1', status: 'in' },
    { event_id: 'e-next', player_id: 'p2', status: 'out' },
  ])
  listAttendanceForEventsMock.mockResolvedValue([
    { event_id: 'e-past', player_id: 'p1', status: 'absent' },
    { event_id: 'e-past', player_id: 'p2', status: 'present' },
  ])
  listMatchSheetsForMock.mockResolvedValue(new Map())
  listNoticesMock.mockResolvedValue([])
  listMyReadsMock.mockResolvedValue([])
})

describe('the gate', () => {
  it('turns a parent-only account away with "not your squad", not a crash', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }]),
    )
    renderAt('/squad/t-u12')
    expect(await screen.findByText(/isn't one of your squads/i)).toBeInTheDocument()
    // The page must not have fetched squad data it was never going to show.
    expect(listEventsMock).not.toHaveBeenCalled()
  })

  it('lands a one-squad coach straight in their hub from bare /squad', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
    renderAt('/squad')
    expect(await screen.findByRole('heading', { name: /U12 Mixed/i })).toBeInTheDocument()
  })

  it('offers a multi-squad manager the picker as Your squads rows', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([
        { role: 'manager', team_id: 't-u12', status: 'active' },
        { role: 'manager', team_id: 't-u14', status: 'active' },
      ]),
    )
    renderAt('/squad')
    expect(await screen.findByRole('heading', { name: /^your squads$/i })).toBeInTheDocument()
    expect(screen.queryByText(/which squad/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('section-club-squads')).not.toBeInTheDocument()
    // In CLUB order (sort_order), not the shuffled fixture order — Jay's
    // 21 Aug report: the picker listed squads as the database inserted them.
    const yours = screen.getByTestId('section-your-squads')
    const links = within(yours).getAllByTestId('squad-hub-row')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/squad/t-u12', '/squad/t-u14'])
    expect(links[0]).toHaveTextContent('U12 Mixed')
    expect(links[0]).toHaveTextContent('Team Manager')
  })

  it('turns a parent-only account away from the picker, not a list they cannot open', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }]),
    )
    renderAt('/squad')
    expect(await screen.findByText(/for squad staff/i)).toBeInTheDocument()
    expect(screen.queryByTestId('squad-hub-row')).not.toBeInTheDocument()
  })
})

describe('the picker — yours first', () => {
  it('leads an admin parent with their squad, then the rest of the club', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([
        { role: 'admin', team_id: null, status: 'active' },
        { role: 'parent', team_id: 't-u8', status: 'active', player_id: 'p-child' },
      ]),
    )
    renderAt('/squad')
    const yours = await screen.findByTestId('section-your-squads')
    const rest = screen.getByTestId('section-club-squads')
    expect(within(yours).getAllByTestId('squad-hub-row').map((link) => link.getAttribute('href'))).toEqual([
      '/squad/t-u8',
    ])
    expect(within(rest).getAllByTestId('squad-hub-row').map((link) => link.getAttribute('href'))).toEqual([
      '/squad/t-u12',
      '/squad/t-u14',
    ])
    expect(within(rest).getByRole('heading', { name: /the rest of the club/i })).toBeInTheDocument()
    // Against the injected fault "flat list in club order": U8 would still
    // appear, just not first among the links. The section split is the proof.
    expect(yours.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not invent an empty Your squads card for a club-only admin', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'admin', team_id: null, status: 'active' }]),
    )
    renderAt('/squad')
    expect(await screen.findByTestId('section-club-squads')).toBeInTheDocument()
    expect(screen.queryByTestId('section-your-squads')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^the club$/i })).toBeInTheDocument()
    expect(screen.getAllByTestId('squad-hub-row')).toHaveLength(3)
  })
})

describe('the picker — loading', () => {
  it('holds editorial row shapes while memberships load, and announces it', () => {
    useMembershipsMock.mockReturnValue({ memberships: [], teams: [], loading: true })
    renderAt('/squad')

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Loading your squads…')
    const skeleton = screen.getByTestId('squad-hub-picker-skeleton')
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton.querySelector('.rounded-full')).toBeTruthy()
    expect(skeleton.querySelector('.rounded-card')).toBeTruthy()
    expect(document.querySelector('.animate-spin')).toBeNull()
    expect(screen.queryByTestId('squad-hub-skeleton')).not.toBeInTheDocument()
  })
})

describe('the tracking grid', () => {
  beforeEach(() => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
  })

  it('discriminates said-in-but-absent from said-in-and-present', async () => {
    renderAt('/squad/t-u12')
    const table = await screen.findByRole('table')
    const noShowRow = within(table).getByRole('row', { name: /Ines Vukovic/ })
    const cameRow = within(table).getByRole('row', { name: /Tomas Aldana/ })
    // p1: said in, marked absent → 1 no-show, 0%. p2: said in, present → 0, 100%.
    // Against the injected fault "count absences as no-shows regardless of
    // RSVP" AND the fault "count every in-RSVP": the two rows differ only in
    // what the REGISTER says, so both faults collapse them to the same count.
    expect(within(noShowRow).getByText('1')).toBeInTheDocument()
    expect(within(noShowRow).getByText('0')).toBeInTheDocument() // 0%
    expect(within(cameRow).getByText('100')).toBeInTheDocument()
  })

  it('reports the squad summary with the no-show called out', async () => {
    renderAt('/squad/t-u12')
    expect(await screen.findByText(/50% attendance/)).toBeInTheDocument()
    // The squad summary line uses the same phrase, so scope to the sheet's
    // own summary — the one that pairs it with the player's 0%.
    expect(screen.getAllByText(/1 said-in-but-absent/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows RSVP counts on the upcoming event', async () => {
    renderAt('/squad/t-u12')
    expect(await screen.findByText(/1 in/)).toBeInTheDocument()
    expect(screen.getByText(/1 out/)).toBeInTheDocument()
  })

  // Season-wide numbers (22 Aug 2026, Jay: "track all training the entire
  // season"). FORTY past sessions and the ONLY register mark sits on the
  // OLDEST — the old `.slice(-GRID_EVENT_LIMIT * 2)` pre-trim kept the newest
  // 30, so that mark fell off the maths entirely and every % read "—".
  // (Verified by re-injecting the slice: a 16-event fixture did NOT fail,
  // because 16 < 30 — the count has to clear the pre-trim, not the columns.)
  // Season-wide, p1 reads 100% while the columns still cap at 15.
  it('counts the whole season, not just the newest 15 columns', async () => {
    const seasonTraining = Array.from({ length: 40 }, (_, i) => ({
      id: `e-s${i}`,
      team_id: 't-u12',
      type: 'training',
      title: `Session ${i}`,
      starts_at: `2026-06-01T15:00:00Z`.replace('06-01', `0${4 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`),
    }))
    listEventsMock.mockResolvedValue(seasonTraining)
    listAvailabilityForEventsMock.mockResolvedValue([])
    // e-s0 is the OLDEST (July 1st) — newest-first sorting puts it 16th.
    listAttendanceForEventsMock.mockResolvedValue([
      { event_id: 'e-s0', player_id: 'p1', status: 'present' },
    ])
    renderAt('/squad/t-u12')

    expect(await screen.findByText(/100% attendance across 40 events this season/)).toBeInTheDocument()
    // The matrix still caps its columns: the footnote names both numbers.
    expect(screen.getByText(/newest 15 of 40 events/)).toBeInTheDocument()
    const table = screen.getByRole('table')
    // Player + 15 event columns + % + No-shows = 18 column headers.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(18)
  })
})

describe('the front doors', () => {
  it('offers Game time, without a squad in the link — the screen is cross-squad', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
    renderAt('/squad/t-u12')
    const link = await screen.findByRole('link', { name: /Open game time/i })
    expect(link).toHaveAttribute('href', '/game-time')
  })
})

describe('match sheets', () => {
  it('asks for sheets on a non-minis squad and lists the missing one', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
    renderAt('/squad/t-u12')
    await screen.findByRole('table')
    expect(listMatchSheetsForMock).toHaveBeenCalledWith(['e-past'])
    expect(screen.getByText(/match sheets outstanding/i)).toBeInTheDocument()
  })

  it('never asks for a minis squad — U8 is not on the RCM form', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u8', status: 'active' }]),
    )
    listEventsMock.mockResolvedValue([{ ...PAST_MATCH, id: 'e-u8', team_id: 't-u8' }])
    renderAt('/squad/t-u8')
    await screen.findByRole('heading', { name: /U8 Tag/i })
    await vi.waitFor(() => expect(listMatchSheetsForMock).toHaveBeenCalled())
    expect(listMatchSheetsForMock).toHaveBeenCalledWith([])
    expect(screen.queryByText(/match sheets outstanding/i)).not.toBeInTheDocument()
  })
})

describe('the drill-in', () => {
  beforeEach(() => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
  })

  it('opens the event detail sheet from a Coming up row', async () => {
    const user = userEvent.setup()
    renderAt('/squad/t-u12')
    await user.click(await screen.findByRole('button', { name: /Tuesday training/ }))
    expect(screen.getByTestId('event-detail')).toHaveTextContent('detail: e-next')
  })

  it('drills from detail into availability, with the same event', async () => {
    const user = userEvent.setup()
    renderAt('/squad/t-u12')
    await user.click(await screen.findByRole('button', { name: /Tuesday training/ }))
    await user.click(screen.getByRole('button', { name: 'stub availability' }))
    expect(screen.getByTestId('availability-sheet')).toHaveTextContent('availability: e-next')
    // Availability REPLACES the detail sheet rather than stacking on it —
    // the same one-sheet-at-a-time rule Dashboard follows.
    expect(screen.queryByTestId('event-detail')).not.toBeInTheDocument()
  })

  it('re-fetches on close, so an RSVP set in the sheet reaches the grid', async () => {
    const user = userEvent.setup()
    renderAt('/squad/t-u12')
    await user.click(await screen.findByRole('button', { name: /Tuesday training/ }))
    const callsBefore = listEventsMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'stub close' }))
    // Against the injected fault "just close the sheet": the grid would keep
    // showing pre-sheet data and this count would not move.
    await vi.waitFor(() => expect(listEventsMock.mock.calls.length).toBe(callsBefore + 1))
    expect(screen.queryByTestId('event-detail')).not.toBeInTheDocument()
  })
})

describe('the phone tracking list', () => {
  beforeEach(() => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
  })

  it('lists each player with the two numbers a coach acts on', async () => {
    renderAt('/squad/t-u12')
    // The mobile list and the desktop table are BOTH in the DOM (CSS decides,
    // as with the two navs) — the list is the one holding buttons.
    const row = await screen.findByRole('button', { name: /Ines Vukovic/ })
    // Said in, marked absent: 0% and 1 no-show.
    expect(row).toHaveTextContent('0%')
    expect(row).toHaveTextContent('1 no-show')
  })

  it('opens a per-player history sheet with the same marks as the grid', async () => {
    const user = userEvent.setup()
    renderAt('/squad/t-u12')
    await user.click(await screen.findByRole('button', { name: /Ines Vukovic/ }))
    // Sheet header carries the player, the summary line pairs % and no-shows,
    // and the event row shows the RSVP-beside-register marks.
    expect(screen.getByText('0% attendance')).toBeInTheDocument()
    // The squad summary line uses the same phrase, so scope to the sheet's
    // own summary — the one that pairs it with the player's 0%.
    expect(screen.getAllByText(/1 said-in-but-absent/).length).toBeGreaterThanOrEqual(1)
    // "Quins vs Sharjah" also appears in the match-sheets chaser link, so
    // pick the sheet's copy: the one inside a list item carrying the marks.
    const sheetRow = screen
      .getAllByText(/Quins vs Sharjah/)
      .map((el) => el.closest('li'))
      .find((li) => li && /·|In|A/.test(li.textContent))
    expect(sheetRow).toBeTruthy()
    expect(sheetRow).toHaveTextContent('In') // said in...
    expect(sheetRow).toHaveTextContent('A') // ...marked absent
  })
})

describe('the first-load skeleton', () => {
  it('holds the hub card shapes while events are in flight, and announces it', () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([{ role: 'coach', team_id: 't-u12', status: 'active' }]),
    )
    listEventsMock.mockReturnValue(new Promise(() => {}))
    listPlayersMock.mockReturnValue(new Promise(() => {}))

    renderAt('/squad/t-u12')

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Loading squad…')
    const skeleton = screen.getByTestId('squad-hub-skeleton')
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton.querySelector('.rounded-card')).toBeTruthy()
    expect(document.querySelector('.animate-spin')).toBeNull()
  })
})
