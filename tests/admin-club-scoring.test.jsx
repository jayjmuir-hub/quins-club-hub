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
  // The completeness card on YourPlayers reads this (17 Aug 2026).
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
// ⚠️ EVERY EXPORT AdminClub.jsx IMPORTS MUST BE LISTED HERE, or the import is
// undefined and the screen breaks. Task 4 added createTeam and
// setTeamUsesJerseyNumbers to the screen; they belong here too.
vi.mock('../src/data/teams.js', () => ({
  setTeamScoringKinds: (...args) => setTeamScoringKindsMock(...args),
  setTeamRequiresContact: (...args) => setRequiresContactMock(...args),
  setTeamDefaultFormat: (...args) => setDefaultFormatMock(...args),
  setTeamUsesJerseyNumbers: (...args) => setUsesJerseyNumbersMock(...args),
  createTeam: (...args) => createTeamMock(...args),
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

const ADMIN = [{ id: 'm1', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: CLUB }]

// ⚠️ mockImplementation, NOT mockReturnValue, AND THE RETURNED setTeams IS
// THE REASON. The scoring panel derives the squad it is drawing from `teams`
// by id rather than from a snapshot taken when it opened, so a test that wants
// to prove a reload REDRAWS the panel has to be able to hand the next render a
// different array. A fixed return value would pin the context to whatever it
// held at render time and the panel could never be seen to change.
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
  // Swapping `current` does not itself re-render; the component re-reads the
  // context on the render that the saving flag going false already causes.
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
  createTeamMock.mockResolvedValue({})
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

// The CONTACT/TAG flag, in the same panel and for the same reason: this panel
// is "what applies to this squad". Task 3 of the training-plans dashboard —
// claude/specs/2026-08-21-training-plans-dashboard-design.md.
//
// ⚠️ THE POINT OF EVERY FIXTURE BELOW IS THAT THE NAME DISAGREES WITH THE
// COLUMN. 'U10 Mixed Contact' is stored as TAG and 'U8 Tag' is stored as
// CONTACT, so a screen that read the squad's name — or its age — instead of
// teams.requires_contact fails every assertion here. That is the whole reason
// the flag is a column.
describe('AdminClub — whether a squad plays contact', () => {
  it('offers a contact/tag switch in the scoring panel and saves the column', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    const panel = within(screen.getByTestId('scoring-panel'))

    // Named "U10 Mixed Contact" and reported as tag, because the column says so.
    const toggle = panel.getByRole('switch', { name: /contact rugby/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)

    await waitFor(() => expect(setRequiresContactMock).toHaveBeenCalled())
    expect(setRequiresContactMock).toHaveBeenCalledWith('team-u10', true)
  })

  it('⚠️ turns a contact squad back to tag — the switch is not one-way', async () => {
    // A squad can stop playing contact (a merged age group, an injury-hit
    // season). If the switch only ever sent `true` the club could never undo a
    // mis-tap, and a contact drill would stay publishable to a tag squad.
    const { user } = renderClub([{ ...OVERRIDDEN, requires_contact: true }, U10, U12G, U16B])

    await user.click(await screen.findByTestId('scoring-chip-team-u8'))
    const panel = within(screen.getByTestId('scoring-panel'))

    // Named "U8 Tag" and reported as contact, because the column says so.
    const toggle = panel.getByRole('switch', { name: /contact rugby/i })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)

    await waitFor(() => expect(setRequiresContactMock).toHaveBeenCalled())
    expect(setRequiresContactMock).toHaveBeenCalledWith('team-u8', false)
  })

  it('reloads the squads after the switch, so the flag is not stale', async () => {
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    await user.click(
      within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
    )

    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
  })

  it('⚠️ FLIPS WHERE IT STANDS: the panel stays open showing the NEW value', async () => {
    // A switch reports a state and changes it, so the answer to "did that
    // land?" belongs in the switch itself. Closing the panel on success —
    // which is right for the Save button, because pressing Save finishes a
    // task — takes that answer away at the very moment it arrives, and a
    // second tap then means re-opening the panel to find out what happened.
    //
    // ⚠️ THIS TEST FAILS TWO DIFFERENT WAYS, AND IT NEEDS TO. It fails if the
    // handler closes the panel on success (nothing to query), and it fails if
    // the panel keeps a snapshot of the squad taken when it opened, because
    // then aria-checked stays 'false' however many reloads run.
    const { user, setTeams } = renderClub()
    reloadMock.mockImplementation(async () => {
      setTeams([OVERRIDDEN, { ...U10, requires_contact: true }, U12G, U16B])
    })

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    expect(
      within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
    ).toHaveAttribute('aria-checked', 'false')

    await user.click(
      within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
    )

    // Still open …
    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
    expect(screen.getByTestId('scoring-panel')).toBeInTheDocument()

    // … and showing what the database holds NOW, not what it held on opening.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
      ).toHaveAttribute('aria-checked', 'true'),
    )
    expect(
      within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
    ).toHaveTextContent('Contact')

    // And nothing else about the panel went away with it.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('⚠️ leaves the panel OPEN and the switch unchanged when the write is refused', async () => {
    // Same rule as the scoring save: closing on a refused write presents it as
    // a completed one, and the reload must not run on a write that never
    // landed or the switch redraws as though something had been attempted.
    setRequiresContactMock.mockRejectedValueOnce(new Error('Only a club admin can do that.'))
    const { user } = renderClub()

    await user.click(await screen.findByTestId('scoring-chip-team-u10'))
    await user.click(
      within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
    )

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/only a club admin/i))
    expect(screen.getByTestId('scoring-panel')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('scoring-panel')).getByRole('switch', { name: /contact rugby/i }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('offers a jersey-numbers switch beside Contact rugby, and CONTROL: each switch calls its own writer', async () => {
    // "Jersey numbers" is a column, never derived from Senior — a touch side
    // can be senior without numbers. The CONTROL half is the point: tapping
    // Contact rugby must not also fire the jersey writer, and vice versa.
    const { user } = renderClub()

    await user.click(await screen.findByRole('button', { name: /scoring for u16b/i }))
    const panel = within(screen.getByTestId('scoring-panel'))

    const jerseyToggle = panel.getByRole('switch', { name: 'Jersey numbers' })
    expect(jerseyToggle).toHaveAttribute('aria-checked', 'false')

    await user.click(jerseyToggle)

    await waitFor(() => expect(setUsesJerseyNumbersMock).toHaveBeenCalledWith('team-u16b', true))
    // CONTROL: the Contact switch stayed on its own writer.
    expect(setRequiresContactMock).not.toHaveBeenCalled()

    await user.click(panel.getByRole('switch', { name: /contact rugby/i }))
    await waitFor(() => expect(setRequiresContactMock).toHaveBeenCalledWith('team-u16b', true))
    // CONTROL, the other direction: the contact tap did not also fire jersey.
    expect(setUsesJerseyNumbersMock).toHaveBeenCalledTimes(1)
  })

  it('saves the squad’s usual tournament format from the scoring sheet', async () => {
    const { user } = renderClub()
    await user.click(await screen.findByRole('button', { name: /scoring for u16b/i }))
    const select = await screen.findByLabelText(/usual tournament format/i)
    expect(select).toHaveValue('')
    await user.selectOptions(select, '12')
    await waitFor(() => expect(setDefaultFormatMock).toHaveBeenCalledWith('team-u16b', 12))
    expect(reloadMock).toHaveBeenCalled()
  })

  it('clears it back to "15s (default)" with null', async () => {
    const { user } = renderClub([{ ...U16B, default_format: 7 }])
    await user.click(await screen.findByRole('button', { name: /scoring for u16b/i }))
    const select = await screen.findByLabelText(/usual tournament format/i)
    expect(select).toHaveValue('7')
    await user.selectOptions(select, '')
    await waitFor(() => expect(setDefaultFormatMock).toHaveBeenCalledWith('team-u16b', null))
  })
})
