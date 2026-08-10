import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The register sheet — who actually turned up.
//
// ⚠️ THE TWO THINGS WORTH TESTING are the two that make attendance mean
// anything at all:
//
//   1. a parent gets NO write controls. The whole value of the number is that
//      somebody other than the interested party recorded it, which is why
//      `is_own_player` is in the attendance READ policy and in no write
//      policy. If this sheet ever renders status buttons for a parent, the
//      feature is worthless even though RLS would still refuse the write.
//
//   2. "not recorded" is not "absent". A register that defaulted everyone to
//      absent would manufacture absences for every session a coach forgot to
//      take, and those absences would then feed an attendance percentage.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listAttendanceMock = vi.fn()
const setAttendanceMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

vi.mock('../src/data/attendance.js', async () => {
  const actual = await vi.importActual('../src/data/attendance.js')
  return {
    ATTENDANCE_STATUSES: actual.ATTENDANCE_STATUSES,
    listAttendance: (...args) => listAttendanceMock(...args),
    setAttendance: (...args) => setAttendanceMock(...args),
  }
})

import Register from '../src/screens/Register.jsx'

const TEAM = { id: 'team-u10', name: 'U10' }
const EVENT = {
  id: 'e1',
  team_id: 'team-u10',
  type: 'training',
  title: 'U10 skills session',
  starts_at: '2026-07-21T15:30:00Z',
}
const PLAYERS = [
  { id: 'p1', team_id: 'team-u10', full_name: 'Amir Haddad' },
  { id: 'p2', team_id: 'team-u10', full_name: 'Bea Okoro' },
  { id: 'p3', team_id: 'team-u10', full_name: 'Cal Fletcher' },
]

const COACH = [{ id: 'm1', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm2', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

function asRole(memberships) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
}

beforeEach(() => {
  useMembershipsMock.mockReset()
  listPlayersMock.mockReset().mockResolvedValue(PLAYERS)
  listAttendanceMock.mockReset().mockResolvedValue([])
  setAttendanceMock.mockReset().mockImplementation(async (eventId, playerId, status) => ({
    id: `a-${playerId}`,
    event_id: eventId,
    player_id: playerId,
    status,
  }))
  asRole(COACH)
})

function renderRegister() {
  return render(<Register event={EVENT} team={TEAM} onClose={vi.fn()} />)
}

describe('the register', () => {
  it('lists every player in the squad', async () => {
    renderRegister()
    expect(await screen.findAllByTestId('register-row')).toHaveLength(3)
  })

  it('⚠️ shows "not recorded", never "absent", before anybody is marked', async () => {
    // The distinction the whole feature rests on. Defaulting to absent would
    // manufacture an absence for every session a coach forgot to take, and
    // those would then feed the attendance percentage.
    renderRegister()
    await screen.findAllByTestId('register-row')

    expect(screen.getByText(/3 not recorded/)).toBeInTheDocument()
    expect(screen.queryByText(/3 absent/)).not.toBeInTheDocument()
  })

  it('records a status against the tapped player', async () => {
    renderRegister()
    const rows = await screen.findAllByTestId('register-row')

    await userEvent.click(within(rows[1]).getByRole('button', { name: 'Absent' }))

    expect(setAttendanceMock).toHaveBeenCalledWith('e1', 'p2', 'absent')
  })

  it('surfaces a refusal instead of showing a status that was never saved', async () => {
    // setAttendance throws when RLS filters the write out — PostgREST reports
    // success with no row. Nothing here may optimistically paint the button.
    setAttendanceMock.mockRejectedValue(new Error('You may not have permission to record attendance'))
    renderRegister()
    const rows = await screen.findAllByTestId('register-row')

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Present' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission to record attendance/i)
  })

  describe('mark remaining present', () => {
    it('marks only the players with no record yet', async () => {
      // ⚠️ NEVER OVERWRITES A DECISION ALREADY MADE. A coach who records two
      // absences first and then sweeps must not undo their own work.
      listAttendanceMock.mockResolvedValue([
        { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'absent' },
      ])
      renderRegister()
      await screen.findAllByTestId('register-row')

      await userEvent.click(screen.getByRole('button', { name: /mark remaining 2 present/i }))

      const marked = setAttendanceMock.mock.calls.map((call) => call[1])
      expect(marked).toEqual(['p2', 'p3'])
      expect(marked).not.toContain('p1')
    })

    it('is not offered once everyone has a record', async () => {
      listAttendanceMock.mockResolvedValue(
        PLAYERS.map((p, i) => ({ id: `a${i}`, event_id: 'e1', player_id: p.id, status: 'present' })),
      )
      renderRegister()
      await screen.findAllByTestId('register-row')

      expect(screen.queryByRole('button', { name: /mark remaining/i })).not.toBeInTheDocument()
    })
  })

  describe('⚠️ a parent', () => {
    it('FAULT: gets no status buttons at all', async () => {
      // RLS would refuse the write anyway, but a sheet that offers the control
      // is telling a parent they may mark their own child present. They may
      // not, and that is the point of the feature.
      asRole(PARENT)
      listAttendanceMock.mockResolvedValue([
        { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'present' },
      ])
      renderRegister()
      await screen.findAllByTestId('register-row')

      expect(screen.queryByRole('button', { name: 'Present' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Absent' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /mark remaining/i })).not.toBeInTheDocument()
    })

    it('is told why the list is short rather than left to think it is broken', async () => {
      asRole(PARENT)
      renderRegister()
      await screen.findAllByTestId('register-row')

      expect(screen.getByText(/only a coach can record attendance/i)).toBeInTheDocument()
    })

    it('FAULT: the same fixture DOES give a coach the buttons', async () => {
      // Without this, deleting the controls outright would pass every
      // assertion above.
      asRole(COACH)
      renderRegister()
      await screen.findAllByTestId('register-row')

      expect(screen.getAllByRole('button', { name: 'Present' }).length).toBeGreaterThan(0)
    })
  })
})
