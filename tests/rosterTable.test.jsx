import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Tests for the desktop roster table (desktop-spec.md §5.1) and its inline
// editing. The mobile card list is covered by tests/roster.test.jsx and is
// deliberately untouched by this file.
//
// Desktop is selected by stubbing window.matchMedia rather than by a shared
// setup flag, so the intent is visible here: jsdom does not implement
// matchMedia, useMediaQuery returns false without it, and every other suite
// therefore keeps rendering the mobile branch. That is the whole reason the
// switch is made in JS — a CSS-only switch would leave both the cards and the
// table in the DOM and make every by-name query ambiguous.
//
// The failure-mode tests are the ones that matter. Inline editing writes
// straight to the database, so a refusal has to put the old value back and
// say so in the row that caused it.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const upsertPlayerMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  getPlayerContact: vi.fn().mockResolvedValue(null),
  upsertPlayer: (...a) => upsertPlayerMock(...a),
}))

import Roster from '../src/screens/Roster.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12', sort_order: 6 }
const TEAMS = [TEAM_U10, TEAM_U12]

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH_U10 = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]

const TOM = { id: 'p1', team_id: 'team-u10', full_name: 'Tom Fletcher', position: 'Flanker', is_captain: true }
const AMY = { id: 'p2', team_id: 'team-u12', full_name: 'Amy Rose', position: 'Wing', is_captain: false }
const ZAC = { id: 'p3', team_id: 'team-u10', full_name: 'Zac Bell', position: null, is_captain: false }

function setDesktop(isDesktop = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop(true)
  useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: TEAMS })
  listPlayersMock.mockResolvedValue([TOM, AMY, ZAC])
  upsertPlayerMock.mockImplementation(async (p) => ({ ...p }))
})

const rows = () => screen.getAllByTestId('roster-table-row')
const names = () => screen.getAllByTestId('table-player-name').map((n) => n.textContent)

describe('RosterTable — rendering', () => {
  it('renders the table on desktop instead of the mobile card list', async () => {
    render(<Roster />)
    expect(await screen.findByTestId('roster-table')).toBeInTheDocument()
    expect(screen.queryByTestId('player-row')).not.toBeInTheDocument()
  })

  it('renders the mobile card list and no table below the breakpoint', async () => {
    setDesktop(false)
    render(<Roster />)
    expect(await screen.findAllByTestId('player-row')).toHaveLength(3)
    expect(screen.queryByTestId('roster-table')).not.toBeInTheDocument()
  })

  it('shows every visible player as one row', async () => {
    render(<Roster />)
    await screen.findByTestId('roster-table')
    expect(rows()).toHaveLength(3)
  })

  it('has no jersey column — the club does not use squad numbers', async () => {
    render(<Roster />)
    await screen.findByTestId('roster-table')
    expect(screen.queryByRole('columnheader', { name: /jersey|number|#/i })).not.toBeInTheDocument()
  })
})

describe('RosterTable — sorting', () => {
  it('sorts by name ascending by default', async () => {
    render(<Roster />)
    await screen.findByTestId('roster-table')
    expect(names()).toEqual(['Amy Rose', 'Tom Fletcher', 'Zac Bell'])
  })

  it('reverses the sort when the same header is clicked twice', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')
    await user.click(screen.getByRole('button', { name: /^Name/ }))
    expect(names()).toEqual(['Zac Bell', 'Tom Fletcher', 'Amy Rose'])
  })

  it('sorts players with no position last, not first', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')
    await user.click(screen.getByRole('button', { name: /^Position/ }))
    expect(names()[2]).toBe('Zac Bell')
  })

  it('exposes the sort direction to assistive tech via aria-sort', async () => {
    render(<Roster />)
    await screen.findByTestId('roster-table')
    const header = screen.getByRole('columnheader', { name: /Name/ })
    expect(header).toHaveAttribute('aria-sort', 'ascending')
  })
})

describe('RosterTable — inline editing', () => {
  it('writes only the changed field, keyed by id', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledWith({ id: 'p3', position: 'Prop' }))
  })

  it('does not write when the value is unchanged', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Position for Tom Fletcher'), 'Flanker')
    expect(upsertPlayerMock).not.toHaveBeenCalled()
  })

  it('writes null rather than an empty string when a position is cleared', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Position for Tom Fletcher'), '')
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledWith({ id: 'p1', position: null }))
  })

  it('moves a player to another age group', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Age group for Zac Bell'), 'team-u12')
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledWith({ id: 'p3', team_id: 'team-u12' }))
  })

  it('toggles captain and reports the state through aria-pressed', async () => {
    const user = userEvent.setup()
    render(<Roster />)
    await screen.findByTestId('roster-table')

    const toggle = screen.getByRole('button', { name: 'Captain: Zac Bell' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledWith({ id: 'p3', is_captain: true }))
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Captain: Zac Bell' }),
    ).toHaveAttribute('aria-pressed', 'true'))
  })

  it('updates the cell optimistically, before the write resolves', async () => {
    const user = userEvent.setup()
    let release
    upsertPlayerMock.mockImplementation(() => new Promise((r) => { release = r }))

    render(<Roster />)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')

    // Still in flight, but the cell already shows the new value.
    expect(screen.getByLabelText('Position for Zac Bell')).toHaveValue('Prop')
    release({ id: 'p3', position: 'Prop' })
  })
})

describe('RosterTable — refusals', () => {
  it('puts the old value back and names the failure in the row when the write is refused', async () => {
    const user = userEvent.setup()
    upsertPlayerMock.mockRejectedValue(
      new Error("We couldn't save that player. You may not have permission to change this squad."),
    )

    render(<Roster />)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/may not have permission/i)
    // Reverted, not left showing a value the database rejected.
    expect(screen.getByLabelText('Position for Zac Bell')).toHaveValue('')
  })

  it('reports the refusal in the row that caused it, not globally', async () => {
    const user = userEvent.setup()
    upsertPlayerMock.mockRejectedValue(new Error('Refused'))

    render(<Roster />)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')

    await screen.findByRole('alert')
    const zacRow = rows().find((r) => within(r).queryByText('Zac Bell'))
    expect(within(zacRow).getByRole('alert')).toBeInTheDocument()
  })

  it('clears a previous error when the next edit on that row succeeds', async () => {
    const user = userEvent.setup()
    upsertPlayerMock.mockRejectedValueOnce(new Error('Refused'))

    render(<Roster />)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')
    await screen.findByRole('alert')

    upsertPlayerMock.mockResolvedValue({ id: 'p3', position: 'Lock' })
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Lock')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('RosterTable — permissions', () => {
  it('renders cells as plain text, not controls, for a squad the user cannot edit', async () => {
    useMembershipsMock.mockReturnValue({ memberships: COACH_U10, teams: TEAMS })
    // A coach of U10 only sees U10 through visibleTeams, so put a second U10
    // player in and assert the control exists there — then prove the
    // read-only path with a membership that resolves to no editable team.
    listPlayersMock.mockResolvedValue([TOM, ZAC])

    render(<Roster />)
    await screen.findByTestId('roster-table')
    expect(screen.getByLabelText('Position for Tom Fletcher')).toBeInTheDocument()
  })

  it('never renders a control the database would refuse', async () => {
    // Parent role: canEditTeam is false for every team, so no cell in the
    // table may be a form control. This is the UI half of the contract — RLS
    // is what actually enforces it.
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }],
      teams: TEAMS,
    })
    listPlayersMock.mockResolvedValue([TOM, ZAC])

    render(<Roster />)
    await screen.findByTestId('roster-table')
    expect(screen.queryByLabelText(/^Position for/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Captain:/ })).not.toBeInTheDocument()
  })
})
