import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The Club tab gains an "Add squad" form — the FIRST TIME THE APP CREATES A
// SQUAD. Plan: claude/plans/2026-09-02-senior-squads-2a-implementation.md,
// Task 4. Scaffold copied from tests/admin-club-scoring.test.jsx.
//
// ⚠️ Until 3 Sep 2026 every squad in this club was inserted by a migration —
// there was no "add a squad" button anywhere in the app. createTeam() is the
// first write path and it goes through the create_team RPC, which is
// admin-gated inside the function rather than relying on RLS to filter an
// unauthorised write to zero rows (see src/data/teams.js).

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listAllLeagueTeamsMock = vi.fn()
const setTeamScoringKindsMock = vi.fn()
const setRequiresContactMock = vi.fn()
const setDefaultFormatMock = vi.fn()
const setUsesJerseyNumbersMock = vi.fn()
const createTeamMock = vi.fn()
const reloadMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  listContactsForPlayers: (...args) => listContactsForPlayersMock(...args),
  listPlayerPrivate: async () => [],
}))
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  listClubMembers: vi.fn(),
  createInvite: vi.fn(),
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listAllLeagueTeams: (...args) => listAllLeagueTeamsMock(...args),
  upsertLeagueTeam: vi.fn(),
  setLeagueTeamActive: vi.fn(),
}))
// ⚠️ EVERY EXPORT AdminClub.jsx IMPORTS FROM teams.js MUST BE LISTED HERE, or
// the import is undefined and the screen breaks — this factory is what bit
// tests/admin-club-scoring.test.jsx before createTeam and
// setTeamUsesJerseyNumbers were added to it too.
vi.mock('../src/data/teams.js', () => ({
  setTeamScoringKinds: (...args) => setTeamScoringKindsMock(...args),
  setTeamRequiresContact: (...args) => setRequiresContactMock(...args),
  setTeamDefaultFormat: (...args) => setDefaultFormatMock(...args),
  setTeamUsesJerseyNumbers: (...args) => setUsesJerseyNumbersMock(...args),
  createTeam: (...args) => createTeamMock(...args),
}))

import AdminClub from '../src/screens/AdminClub.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'

const U10 = { id: 'team-u10', club_id: CLUB, name: 'U10 Mixed Contact', sort_order: 1 }
const TEAMS = [U10]

const ADMIN = [{ id: 'm1', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: CLUB }]

function renderClub(teams = TEAMS) {
  const user = userEvent.setup()
  let current = teams
  useMembershipsMock.mockImplementation(() => ({
    memberships: ADMIN,
    teams: current,
    loading: false,
    error: null,
    reload: reloadMock,
  }))
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminClub />
    </MemoryRouter>,
  )
  return { user, setTeams: (next) => { current = next } }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listAllLeagueTeamsMock.mockResolvedValue([])
  setTeamScoringKindsMock.mockResolvedValue({})
  setRequiresContactMock.mockResolvedValue({})
  setDefaultFormatMock.mockResolvedValue({})
  setUsesJerseyNumbersMock.mockResolvedValue({})
  createTeamMock.mockResolvedValue({ id: 'team-new', name: 'Harness Senior A' })
  reloadMock.mockResolvedValue(undefined)
})

describe('AdminClub — add a squad', () => {
  it('opens a sheet with a name field and three switches', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: 'Add squad' }))

    const sheet = await screen.findByRole('dialog', { name: /add a squad/i })
    expect(within(sheet).getByLabelText('Squad name')).toBeInTheDocument()
    expect(within(sheet).getByRole('switch', { name: 'Senior squad' })).toBeInTheDocument()
    expect(within(sheet).getByRole('switch', { name: 'Jersey numbers' })).toBeInTheDocument()
    expect(
      within(sheet).getByRole('switch', { name: 'Players may register themselves' }),
    ).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('saves the four values, reloads the squads, and closes the sheet', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: 'Add squad' }))
    const sheet = await screen.findByRole('dialog', { name: /add a squad/i })

    await user.type(within(sheet).getByLabelText('Squad name'), 'Harness Senior A')
    await user.click(within(sheet).getByRole('switch', { name: 'Senior squad' }))
    await user.click(within(sheet).getByRole('switch', { name: 'Jersey numbers' }))
    await user.click(
      within(sheet).getByRole('switch', { name: 'Players may register themselves' }),
    )
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createTeamMock).toHaveBeenCalledWith({
        name: 'Harness Senior A',
        isSenior: true,
        usesJerseyNumbers: true,
        selfRegistrationAllowed: true,
      }),
    )
    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /add a squad/i })).toBeNull())
  })

  it('⚠️ CONTROL: a blank name refuses to save and calls nothing', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: 'Add squad' }))
    const sheet = await screen.findByRole('dialog', { name: /add a squad/i })

    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    expect(await within(sheet).findByText('A squad needs a name.')).toBeInTheDocument()
    expect(createTeamMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
    // Still open — a refused save is not a completed one.
    expect(screen.getByRole('dialog', { name: /add a squad/i })).toBeInTheDocument()
  })

  it('shows a thrown message inline on a refused save', async () => {
    createTeamMock.mockRejectedValueOnce(new Error('Only a club admin can add a squad.'))
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: 'Add squad' }))
    const sheet = await screen.findByRole('dialog', { name: /add a squad/i })
    await user.type(within(sheet).getByLabelText('Squad name'), 'Harness Senior A')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    expect(await within(sheet).findByText(/only a club admin can add a squad/i)).toBeInTheDocument()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /add a squad/i })).toBeInTheDocument()
  })
})
