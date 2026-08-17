import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Task 5 of claude/plans/2026-08-11-league-teams-implementation.md — managing
// the club's LEAGUE TEAMS from the Club tab.
//
// ⚠️ A SQUAD AND A LEAGUE TEAM ARE DIFFERENT THINGS, and this screen is the
// only place the difference is editable. `U14B Contact` is the training squad
// (and its letter is GENDER, not division); `ADHQ2` is what plays in Div B.
// One squad can enter three.
//
// ⚠️ NOTHING HERE IS SECURITY. The RLS policy behind `league_teams` is
// `is_admin`, and this screen is already mounted inside AdminDashboard's admin
// gate. No test in this file touches RLS; db/tests/rls-league-teams.sql does.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listAllLeagueTeamsMock = vi.fn()
const upsertLeagueTeamMock = vi.fn()
const setLeagueTeamActiveMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// AdminClub renders InviteForm in a Sheet; it reads useAuth and createInvite.
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  listContactsForPlayers: (...args) => listContactsForPlayersMock(...args),
  // The completeness card on YourPlayers reads this (17 Aug 2026).
  listPlayerPrivate: async () => [],
}))

vi.mock('../src/data/members.js', () => ({
  listClubMembers: vi.fn(),
  createInvite: vi.fn(),
}))

vi.mock('../src/data/leagueTeams.js', () => ({
  listAllLeagueTeams: (...args) => listAllLeagueTeamsMock(...args),
  upsertLeagueTeam: (...args) => upsertLeagueTeamMock(...args),
  setLeagueTeamActive: (...args) => setLeagueTeamActiveMock(...args),
}))

import AdminClub from '../src/screens/AdminClub.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U14B = { id: 'team-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 5 }
const TEAM_U16B = { id: 'team-u16b', club_id: CLUB, name: 'U16B Contact', sort_order: 6 }
const TEAMS = [TEAM_U14B, TEAM_U16B]

// U14B has entered three league teams — the case a column on `teams` could not
// have held, and the reason league_teams is a table. U16B has entered none.
const ADHQ1 = { id: 'lt-1', club_id: CLUB, team_id: 'team-u14b', rcm_name: 'ADHQ1', division: 'A', is_active: true, sort_order: 0 }
const ADHQ2 = { id: 'lt-2', club_id: CLUB, team_id: 'team-u14b', rcm_name: 'ADHQ2', division: 'B', is_active: true, sort_order: 0 }
const ADHQ3 = { id: 'lt-3', club_id: CLUB, team_id: 'team-u14b', rcm_name: 'ADHQ3', division: null, is_active: false, sort_order: 0 }
const LEAGUE_TEAMS = [ADHQ1, ADHQ2, ADHQ3]

const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: CLUB }]

function renderClub() {
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminClub />
    </MemoryRouter>,
  )
  return { user, ...utils }
}

const squadRow = (id) => screen.findByTestId(`team-row-${id}`)

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listAllLeagueTeamsMock.mockResolvedValue(LEAGUE_TEAMS)
  upsertLeagueTeamMock.mockResolvedValue(ADHQ2)
  setLeagueTeamActiveMock.mockResolvedValue(undefined)
})

describe('AdminClub — the club\'s league teams', () => {
  it('lists a squad\'s league teams against that squad, and offers to add one', async () => {
    renderClub()

    const u14b = await squadRow('team-u14b')
    expect(within(u14b).getByText('ADHQ1')).toBeInTheDocument()
    expect(within(u14b).getByText('ADHQ2')).toBeInTheDocument()
    expect(
      within(u14b).getByRole('button', { name: /add league team to U14B Contact/i }),
    ).toBeInTheDocument()
  })

  it('⚠️ files each league team under its OWN squad, never club-wide', async () => {
    // A U14 team shown under U16 is the mistake that reaches the governing
    // body as a wrong result rather than as an obvious slip.
    renderClub()

    const u16b = await squadRow('team-u16b')
    expect(within(u16b).queryByText('ADHQ1')).not.toBeInTheDocument()
    expect(within(u16b).queryByText('ADHQ2')).not.toBeInTheDocument()
  })

  it('offers to add one to a squad that has entered none', async () => {
    renderClub()

    const u16b = await squadRow('team-u16b')
    expect(
      within(u16b).getByRole('button', { name: /add league team to U16B Contact/i }),
    ).toBeInTheDocument()
  })

  it('⚠️ asks for RETIRED teams too — this is the only screen that can restore one', async () => {
    renderClub()

    await squadRow('team-u14b')
    expect(listAllLeagueTeamsMock).toHaveBeenCalledWith({ includeRetired: true })
  })

  it('⚠️ a retired league team is ANNOUNCED as retired, not merely drawn faintly', async () => {
    // The dashed outline says nothing to a screen reader, and "which of these
    // are we still entering" is the question this section answers.
    renderClub()

    expect(await screen.findByRole('button', { name: /ADHQ3, retired/i })).toBeInTheDocument()
  })

  it('shows the division on the chip, because that is what tells the teams apart', async () => {
    renderClub()

    const chip = await screen.findByRole('button', { name: /^ADHQ2, Division B$/i })
    expect(chip).toHaveTextContent('B')
  })

  it('renames through upsertLeagueTeam, carrying the id', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /^ADHQ2, Division B$/i }))
    const field = screen.getByLabelText('League team name')
    await user.clear(field)
    await user.type(field, 'ADHQ2B')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(upsertLeagueTeamMock).toHaveBeenCalled())
    expect(upsertLeagueTeamMock).toHaveBeenCalledWith({
      id: 'lt-2',
      rcm_name: 'ADHQ2B',
      division: 'B',
    })
  })

  it('⚠️ adds against the SQUAD THAT WAS CLICKED, carrying its team_id and club_id', async () => {
    const { user } = renderClub()

    const u16b = await squadRow('team-u16b')
    await user.click(within(u16b).getByRole('button', { name: /add league team to U16B Contact/i }))

    await user.type(screen.getByLabelText('League team name'), 'ADHQ-U16')
    await user.selectOptions(screen.getByLabelText('Division'), 'C')
    await user.click(screen.getByRole('button', { name: /add league team$/i }))

    await waitFor(() => expect(upsertLeagueTeamMock).toHaveBeenCalled())
    expect(upsertLeagueTeamMock).toHaveBeenCalledWith({
      club_id: CLUB,
      team_id: 'team-u16b',
      rcm_name: 'ADHQ-U16',
      division: 'C',
    })
  })

  it('⚠️ sends division as NULL when there is none, never an empty string', async () => {
    // `division` carries a check constraint of ('A','B','C'). An empty string
    // is not "no division" to Postgres, it is a violation — and the save would
    // fail with a constraint error on a field the person deliberately left
    // blank. Nullable is on purpose: a club can enter a team that is in no
    // lettered division at all.
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /^ADHQ2, Division B$/i }))
    await user.selectOptions(screen.getByLabelText('Division'), '')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(upsertLeagueTeamMock).toHaveBeenCalled())
    expect(upsertLeagueTeamMock).toHaveBeenCalledWith({
      id: 'lt-2',
      rcm_name: 'ADHQ2',
      division: null,
    })
  })

  it('retires through setLeagueTeamActive, and offers to bring a retired one back', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /^ADHQ2, Division B$/i }))
    await user.click(screen.getByRole('button', { name: /^retire$/i }))
    await waitFor(() => expect(setLeagueTeamActiveMock).toHaveBeenCalledWith('lt-2', false))

    await user.click(await screen.findByRole('button', { name: /ADHQ3, retired/i }))
    expect(screen.getByRole('button', { name: /bring back/i })).toBeInTheDocument()
  })

  it('⚠️ says that retiring keeps the label on fixtures already played', async () => {
    // The opposite of the pitch warning, and worth saying for the same reason:
    // people arrive expecting Delete. `events.league_team_id` is a real foreign
    // key, so a rename follows every fixture and a retire changes nothing that
    // has already happened. Deleting would be the destructive one — which is
    // why the screen does not offer it.
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /^ADHQ2, Division B$/i }))
    expect(screen.getByText(/fixtures already played keep/i)).toBeInTheDocument()
  })

  it('refuses to save an empty name', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /^ADHQ2, Division B$/i }))
    await user.clear(screen.getByLabelText('League team name'))
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('⚠️ surfaces a refused save rather than closing as if it worked', async () => {
    // upsertLeagueTeam throws on the RLS-filtered write that reports no error
    // at all. If this screen swallowed that, a refused rename would be
    // presented as saved.
    upsertLeagueTeamMock.mockRejectedValue(new Error("We couldn't save that league team."))
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /^ADHQ2, Division B$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save that league team/i)
    // Still open, with the person's typing intact.
    expect(screen.getByLabelText('League team name')).toHaveValue('ADHQ2')
  })

  it('leaves the age-group counts it was added to alone', async () => {
    // The section shares its rows with the roster-gap counts; adding league
    // teams must not displace them.
    listPlayersMock.mockResolvedValue([{ id: 'p1', team_id: 'team-u14b' }])
    renderClub()

    const u14b = await squadRow('team-u14b')
    expect(u14b).toHaveTextContent('1 player')
    expect(u14b).toHaveTextContent('1 missing contact info')
  })
})
