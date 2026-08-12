import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The club's per-squad SCORING SET, on the Club tab.
// Plan: claude/plans/2026-08-12-scoring-model.md.
//
// Jay, 12 Aug 2026: scoring should be "a selectable option for scoring
// methods", set "in the area where teams are created".
//
// ⚠️ NOTHING HERE IS SECURITY. `team manage` is is_admin(club_id) and this
// screen is already inside AdminDashboard's admin gate. What is being pinned is
// that the app never silently decides what a squad may score.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listAllLeagueTeamsMock = vi.fn()
const setTeamScoringKindsMock = vi.fn()
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
}))
vi.mock('../src/data/members.js', () => ({
  listClubMembers: vi.fn(),
  createInvite: vi.fn(),
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listAllLeagueTeams: (...args) => listAllLeagueTeamsMock(...args),
  upsertLeagueTeam: vi.fn(),
  setLeagueTeamActive: vi.fn(),
}))
vi.mock('../src/data/teams.js', () => ({
  setTeamScoringKinds: (...args) => setTeamScoringKindsMock(...args),
}))

import AdminClub from '../src/screens/AdminClub.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'

// One squad per threshold, plus one already overridden. Every squad this club
// fields collapses onto the band number, which is why three rules replace a
// fifteen-row lookup — see tests/scoring.test.js for the band-by-band proof.
const U10 = { id: 'team-u10', club_id: CLUB, name: 'U10 Mixed Contact', sort_order: 1 }
const U12G = { id: 'team-u12g', club_id: CLUB, name: 'U12G QR', sort_order: 2 }
const U16B = { id: 'team-u16b', club_id: CLUB, name: 'U16B Contact', sort_order: 3 }
const OVERRIDDEN = {
  id: 'team-u8',
  club_id: CLUB,
  name: 'U8 Tag',
  sort_order: 0,
  scoring_kinds: ['tries', 'conversions'],
}
const TEAMS = [OVERRIDDEN, U10, U12G, U16B]

const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: CLUB }]

function renderClub(teams = TEAMS) {
  const user = userEvent.setup()
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams,
    loading: false,
    error: null,
    reload: reloadMock,
  })
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminClub />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listAllLeagueTeamsMock.mockResolvedValue([])
  setTeamScoringKindsMock.mockResolvedValue({})
  reloadMock.mockResolvedValue(undefined)
})

describe('AdminClub — how a squad scores', () => {
  it('shows each squad its own scoring set, from the age band', async () => {
    renderClub()

    const u10 = await screen.findByTestId('team-row-team-u10')
    expect(within(u10).getByTestId('scoring-chip-team-u10')).toHaveAccessibleName(
      /U10 Mixed Contact: Tries, the default for U10/i,
    )

    // ⚠️ THE BAND IS THE DIGITS; THE TRAILING LETTER IS GENDER. `U12G` is U12
    // GIRLS, and this repo has already been bitten by a letter after the digits
    // — src/lib/ageGroup.js carries the note. U12 gets conversions.
    const u12g = await screen.findByTestId('team-row-team-u12g')
    expect(within(u12g).getByTestId('scoring-chip-team-u12g')).toHaveAccessibleName(
      /Tries · Conversions, the default for U12/i,
    )

    const u16b = await screen.findByTestId('team-row-team-u16b')
    expect(within(u16b).getByTestId('scoring-chip-team-u16b')).toHaveAccessibleName(
      /Tries · Conversions · Penalties · Drop goals/i,
    )
  })

  it("⚠️ says when a set is the CLUB'S choice rather than the age band's", async () => {
    // A U8 side scoring conversions is not what the age-grade laws say — it is
    // what the club decided, and the difference has to be visible or nobody can
    // tell a deliberate override from a bug in the band mapping.
    renderClub()
    const u8 = await screen.findByTestId('team-row-team-u8')
    expect(within(u8).getByTestId('scoring-chip-team-u8')).toHaveAccessibleName(
      /set for this squad/i,
    )
  })

  it('saves an override in SCORE_KINDS order, never in tick order', async () => {
    // ⚠️ ORDER IS PART OF THE CONTRACT. The stored order is the order the match
    // sheet renders its boxes, and a row that reorders itself between two
    // squads is how a coach types a conversion into the penalties box.
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    const panel = within(screen.getByTestId('scoring-panel'))

    // Ticked out of order on purpose.
    await user.click(panel.getByRole('checkbox', { name: 'Drop goals' }))
    await user.click(panel.getByRole('checkbox', { name: 'Conversions' }))
    await user.click(panel.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(setTeamScoringKindsMock).toHaveBeenCalled())
    expect(setTeamScoringKindsMock).toHaveBeenCalledWith('team-u10', [
      'tries',
      'conversions',
      'drops',
    ])
  })

  it('⚠️ clears back to NULL, never to the band list frozen in place', async () => {
    // Writing the default's values would freeze the squad at today's reading of
    // the laws. The point of null is that a squad following the age-grade
    // progression keeps following it when the progression is corrected.
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u8'))
    const panel = within(screen.getByTestId('scoring-panel'))
    await user.click(panel.getByRole('button', { name: /use the age-group default/i }))

    await waitFor(() => expect(setTeamScoringKindsMock).toHaveBeenCalled())
    expect(setTeamScoringKindsMock).toHaveBeenCalledWith('team-u8', null)
  })

  it('⚠️ offers no "use the default" button to a squad that has no override', async () => {
    // Nothing to clear. Offering it would be a button that does nothing, on a
    // screen where every other button changes something.
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    const panel = within(screen.getByTestId('scoring-panel'))
    expect(panel.queryByRole('button', { name: /use the age-group default/i })).toBeNull()
  })

  it('⚠️ refuses to save nothing rather than quietly meaning "tries"', async () => {
    // cleanScoringKinds falls back to tries on an empty array so a half-finished
    // edit already in the database can never make a score impossible to enter.
    // That is a safety net for STORED data, not a way to read a button press —
    // saving nothing and getting tries is the app deciding what somebody meant.
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    const panel = within(screen.getByTestId('scoring-panel'))
    await user.click(panel.getByRole('checkbox', { name: 'Tries' })) // untick the only one

    expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(setTeamScoringKindsMock).not.toHaveBeenCalled()
  })

  it('reloads the squads after a save, so the chip is not stale', async () => {
    // `teams` is loaded once per session by the memberships context. Without
    // this the change would sit in the database and the chip would keep showing
    // the old set until a full page reload.
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    const panel = within(screen.getByTestId('scoring-panel'))
    await user.click(panel.getByRole('checkbox', { name: 'Conversions' }))
    await user.click(panel.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
  })

  it('⚠️ leaves the panel OPEN with the ticks intact when the save is refused', async () => {
    // The same rule the league-team panel carries: closing on a refused write
    // presents it as a completed one.
    setTeamScoringKindsMock.mockRejectedValueOnce(new Error('Only a club admin can do that.'))
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    const panel = within(screen.getByTestId('scoring-panel'))
    await user.click(panel.getByRole('checkbox', { name: 'Conversions' }))
    await user.click(panel.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/only a club admin/i),
    )
    expect(screen.getByTestId('scoring-panel')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('scoring-panel')).getByRole('checkbox', { name: 'Conversions' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(reloadMock).not.toHaveBeenCalled()
  })
})
