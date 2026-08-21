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

import SquadHub from '../src/screens/SquadHub.jsx'

const TEAMS = [
  { id: 't-u12', name: 'U12 Mixed', sort_order: 3 },
  { id: 't-u14', name: 'U14B', sort_order: 5 },
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
    expect(await screen.findByRole('heading', { name: /U12 Mixed hub/i })).toBeInTheDocument()
  })

  it('offers a multi-squad manager the picker', async () => {
    useMembershipsMock.mockReturnValue(
      membershipsFor([
        { role: 'manager', team_id: 't-u12', status: 'active' },
        { role: 'manager', team_id: 't-u14', status: 'active' },
      ]),
    )
    renderAt('/squad')
    expect(await screen.findByText(/which squad/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'U12 Mixed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'U14B' })).toBeInTheDocument()
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
    expect(screen.getByText(/1 said-in-but-absent/)).toBeInTheDocument()
  })

  it('shows RSVP counts on the upcoming event', async () => {
    renderAt('/squad/t-u12')
    expect(await screen.findByText(/1 in/)).toBeInTheDocument()
    expect(screen.getByText(/1 out/)).toBeInTheDocument()
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
    await screen.findByRole('heading', { name: /U8 Tag hub/i })
    await vi.waitFor(() => expect(listMatchSheetsForMock).toHaveBeenCalled())
    expect(listMatchSheetsForMock).toHaveBeenCalledWith([])
    expect(screen.queryByText(/match sheets outstanding/i)).not.toBeInTheDocument()
  })
})
