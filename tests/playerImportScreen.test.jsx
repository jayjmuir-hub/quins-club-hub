import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Tests for the bulk import dialog (desktop-spec.md §5.1). The parser itself
// is covered exhaustively by tests/playerImport.test.js — this file is about
// the screen: what the preview promises, what gets sent, and what happens
// when the database refuses.
//
// The insert is all-or-nothing (see src/data/players.js insertPlayers), so
// the preview is the safety mechanism, not decoration. These tests exist to
// stop it drifting from that job.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const insertPlayersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  // ⚠️ The roster reads birthdays for staff since 17 Aug 2026 to show an age.
  // An omitted export is undefined and throws from inside an effect.
  listPlayerPrivate: () => Promise.resolve([]),
  listPlayers: (...a) => listPlayersMock(...a),
  getPlayerContact: vi.fn().mockResolvedValue(null),
  upsertPlayer: vi.fn(),
  insertPlayers: (...a) => insertPlayersMock(...a),
}))

import Roster from '../src/screens/Roster.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12', sort_order: 6 }
const TEAMS = [TEAM_U10, TEAM_U12]
const ADMIN = [{ id: 'm1', role: 'admin', team_id: null, club_id: 'club-1' }]

function setDesktop(isDesktop = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop(true)
  useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: TEAMS })
  listPlayersMock.mockResolvedValue([])
  insertPlayersMock.mockResolvedValue([{ id: 'new-1' }])
})

async function openImport(user) {
  render(<Roster />)
  await user.click(await screen.findByRole('button', { name: 'Import' }))
  return screen.findByTestId('import-paste')
}

const paste = (user, text) => user.type(screen.getByTestId('import-paste'), text)

describe('Import — availability', () => {
  it('offers Import on desktop', async () => {
    render(<Roster />)
    expect(await screen.findByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('does not offer Import on mobile — pasting a spreadsheet into a phone is not a thing', async () => {
    setDesktop(false)
    render(<Roster />)
    await screen.findByRole('button', { name: 'Add player' })
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
  })

  it('is absent for a role that cannot write', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1', club_id: 'club-1' }],
      teams: TEAMS,
    })
    render(<Roster />)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument())
  })
})

describe('Import — preview', () => {
  it('shows nothing to preview until something is pasted', async () => {
    const user = userEvent.setup()
    await openImport(user)
    expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument()
  })

  it('counts the rows that will be added', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10{enter}Amy Rose,Wing,U12')

    expect(await screen.findByTestId('import-valid')).toHaveTextContent('2 ready to add')
    expect(screen.queryByTestId('import-invalid')).not.toBeInTheDocument()
  })

  it('flags a bad row with its reason instead of dropping it silently', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10{enter}Bad Row,Winger,U10')

    expect(await screen.findByTestId('import-invalid')).toHaveTextContent('1 need fixing')
    expect(screen.getByTestId('import-row-bad')).toHaveTextContent('is not a position')
  })

  it('names an age group the user does not have', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U14')
    expect(await screen.findByTestId('import-row-bad')).toHaveTextContent('U14')
  })

  it('says a header row was ignored rather than importing a player called Name', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Name,Position,Team{enter}Tom Fletcher,Flanker,U10')

    expect(await screen.findByText('Header row ignored')).toBeInTheDocument()
    expect(screen.getAllByTestId('import-row-ok')).toHaveLength(1)
  })

  it('disables the button when nothing is valid', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Bad Row,Winger,U99')
    await waitFor(() => expect(screen.getByTestId('import-submit')).toBeDisabled())
  })

  it('warns that only the valid rows will be added when the paste is mixed', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10{enter}Bad,Winger,U10')
    expect(await screen.findByText(/Only the 1 valid row will be added/)).toBeInTheDocument()
  })
})

describe('Import — writing', () => {
  it('sends only the valid rows, shaped for the players table', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10{enter}Bad,Winger,U10')
    await user.click(screen.getByTestId('import-submit'))

    await waitFor(() => expect(insertPlayersMock).toHaveBeenCalledWith([
      // gender null: this paste has three columns, so the fourth is absent
      // and must arrive as null — NOT '' and NOT missing. The database's
      // players_gender_check refuses the empty string, and a bulk insert is a
      // single statement, so one '' would abort all 300 rows.
      { club_id: 'club-1', team_id: 'team-u10', full_name: 'Tom Fletcher', position: 'Flanker', gender: null },
    ]))
  })

  it('never sends jersey_num — the club does not use squad numbers', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10')
    await user.click(screen.getByTestId('import-submit'))

    await waitFor(() => expect(insertPlayersMock).toHaveBeenCalled())
    expect(insertPlayersMock.mock.calls[0][0][0]).not.toHaveProperty('jersey_num')
  })

  it('closes and refreshes the roster on success', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10')
    await user.click(screen.getByTestId('import-submit'))

    await waitFor(() => expect(screen.queryByTestId('import-paste')).not.toBeInTheDocument())
    // Two loads: the initial one and the refresh after importing.
    await waitFor(() => expect(listPlayersMock.mock.calls.length).toBeGreaterThan(1))
  })

  it('keeps the dialog open and reports the refusal, so the paste is not lost', async () => {
    const user = userEvent.setup()
    insertPlayersMock.mockRejectedValue(
      new Error("We couldn't add those players. You may not have permission to change one of those squads."),
    )
    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10')
    await user.click(screen.getByTestId('import-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/may not have permission/i)
    expect(screen.getByTestId('import-paste')).toBeInTheDocument()
  })

  it('does not double-insert when the button is clicked twice', async () => {
    const user = userEvent.setup()
    let release
    insertPlayersMock.mockImplementation(() => new Promise((r) => { release = r }))

    await openImport(user)
    await paste(user, 'Tom Fletcher,Flanker,U10')
    const submit = screen.getByTestId('import-submit')
    await user.click(submit)
    await user.click(submit)

    expect(insertPlayersMock).toHaveBeenCalledTimes(1)
    release([{ id: 'new-1' }])
  })
})
