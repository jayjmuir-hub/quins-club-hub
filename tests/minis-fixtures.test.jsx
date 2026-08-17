import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// U10 AND BELOW, ON THE FIXTURE SCREENS — 15 Aug 2026.
//
// The club's youth section confirmed three facts the app did not know:
//   the league starts at U11;
//   U6-U8 play Mighty Minis at the cricket stadium on league match weekends;
//   U9-U10 play friendly festivals of three or four clubs, each hosting one.
// The RCM sheet's own instructions already said the fourth ("U11 to u16 Games")
// and the app was ignoring it.
//
// ⚠️ EVERY TEST HERE IS PAIRED WITH A U14 CONTROL. The failure mode this change
// could introduce is not "the minis still see it" — it is "everybody lost it",
// and a suite that only asserts absence cannot tell those apart. See
// CLAUDE.md rule 6: confirm the search can find something you know is there.
//
// PROCESS ZONE, like the other fixture suites: kick-offs and deadlines are
// time-of-day facts and a zone bug is invisible under a UTC runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const useMyProfileMock = vi.fn()
const getEventMock = vi.fn()
const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const listMatchSheetsForMock = vi.fn()
const listLeagueTeamsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/lib/useMyProfile.js', () => ({
  default: () => useMyProfileMock(),
}))
vi.mock('../src/data/events.js', () => ({
  getEvent: (...a) => getEventMock(...a),
  listEvents: (...a) => listEventsMock(...a),
  subscribeEvents: () => () => {},
  upsertEvent: async (patch) => patch,
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))
// MatchSheet reads lineups to seed its 22 boxes (16 Aug 2026). Mocked here for
// the same reason every other data module in this file is: the real one imports
// src/lib/supabase.js at module scope.
vi.mock('../src/data/lineups.js', () => ({
  listLineups: async () => [],
  createLineup: async () => ({}),
  updateLineup: async () => ({}),
  saveLineupPlayers: async () => [],
  deleteLineup: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: async () => [],
  // The completeness card on YourPlayers reads this (17 Aug 2026).
  listPlayerPrivate: async () => [],
}))
vi.mock('../src/data/matchSheets.js', async () => {
  const actual = await vi.importActual('../src/data/matchSheets.js')
  return {
    SLOT_COUNT: actual.SLOT_COUNT,
    getMatchSheet: async () => null,
    listMatchSheetsFor: (...a) => listMatchSheetsForMock(...a),
    saveMatchSheet: async (patch) => patch,
    saveMatchSheetSlots: async () => [],
    saveMatchSheetCards: async () => [],
    setMatchSheetStatus: async () => ({}),
  }
})
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))
// ⚠️ EventDetail renders PitchRequest, which reads this on mount. Mocked as the
// whole module rather than partially, so an export added to the real file
// surfaces here as a loud "no such export" instead of a live Supabase call.
vi.mock('../src/data/pitchRequests.js', () => ({
  REQUEST_STATUSES: ['submitted', 'allocated', 'declined', 'cancelled'],
  isOpen: () => false,
  listPitchRequests: async () => [],
  requestPitch: async () => ({}),
  allocatePitch: async () => ({}),
  declinePitch: async () => ({}),
  withdrawRequest: async () => ({}),
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: (...a) => listLeagueTeamsMock(...a),
}))

import EventDetail from '../src/screens/EventDetail.jsx'
import EventForm from '../src/screens/EventForm.jsx'
import MatchSheet from '../src/screens/MatchSheet.jsx'
import YouthDashboard from '../src/screens/YouthDashboard.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
// The club's real squad names. U8 and U10 are the two minis formats; U14B is the
// control, and is the shape ("U14B" — a gender letter touching the digits) that
// has broken age parsing here before.
const U8 = { id: 't-u8', club_id: CLUB, name: 'U8 Tag', sort_order: 3 }
const U10 = { id: 't-u10', club_id: CLUB, name: 'U10 Mixed Contact', sort_order: 5 }
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9 }
const TEAMS = [U8, U10, U14B]

const ADHQ2 = { id: 'lt-2', team_id: 't-u14b', rcm_name: 'ADHQ2', division: 'B', is_active: true }

function fixture(team, extra = {}) {
  return {
    id: `e-${team.id}`,
    club_id: CLUB,
    team_id: team.id,
    type: 'match',
    opponent: 'Dubai Exiles',
    home: true,
    venue: 'Zayed Sports City, Abu Dhabi',
    starts_at: '2026-09-12T05:00:00.000Z',
    ends_at: '2026-09-12T06:30:00.000Z',
    team,
    ...extra,
  }
}

const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null, club_id: CLUB }]
const ADMIN_YOUTH = [{ ...ADMIN[0], admin_rights: ['youth'] }]

function provide(memberships = ADMIN, teams = TEAMS) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useMyProfileMock.mockReturnValue({ profile: null, firstName: '' })
  listPlayersMock.mockResolvedValue([])
  listEventsMock.mockResolvedValue([])
  listMatchSheetsForMock.mockResolvedValue(new Map())
  listLeagueTeamsMock.mockResolvedValue([])
  provide()
})

// ════════════════════════════════════════════════════════════════════════════
describe('EventDetail — the RCM match sheet', () => {
  const open = (team) =>
    render(
      <EventDetail
        event={fixture(team)}
        team={team}
        canEdit
        onClose={vi.fn()}
        onOpenMatchSheet={vi.fn()}
        onOpenLineup={vi.fn()}
      />,
    )

  it('⚠️ is NOT offered on a U10 or U8 fixture — they are not on the form', async () => {
    for (const team of [U8, U10]) {
      const { unmount } = open(team)
      expect(screen.queryByRole('button', { name: /rcm match sheet/i })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('⚠️ IS still offered on U14 — the control that proves the button exists', () => {
    // Without this, "the button is absent" would pass just as happily if the
    // button had been deleted, or if the handler prop had been renamed.
    open(U14B)
    expect(screen.getByRole('button', { name: /rcm match sheet/i })).toBeInTheDocument()
  })

  it('the team sheet is UNTOUCHED — picking a team still happens at U8', () => {
    // Deliberately not simplified away. A festival of three clubs still needs a
    // team picked and shared to a WhatsApp group; only the governing body's
    // result form goes.
    open(U8)
    expect(screen.getByRole('button', { name: /pick the team/i })).toBeInTheDocument()
  })
})

describe('EventDetail — how this squad’s season works', () => {
  const open = (team, event) =>
    render(<EventDetail event={event ?? fixture(team)} team={team} onClose={vi.fn()} />)

  it('tells a U8 parent it is Mighty Minis, at the cricket stadium', () => {
    open(U8)
    const note = screen.getByTestId('squad-format-note')
    expect(note).toHaveTextContent(/mighty minis/i)
    expect(note).toHaveTextContent(/cricket stadium/i)
  })

  it('tells a U10 parent it is a friendly festival, each club hosting one', () => {
    open(U10)
    const note = screen.getByTestId('squad-format-note')
    expect(note).toHaveTextContent(/friendly/i)
    expect(note).toHaveTextContent(/hosts one/i)
  })

  it('⚠️ says NOTHING on a U14 fixture — no card, no placeholder', () => {
    open(U14B)
    expect(screen.queryByTestId('squad-format-note')).not.toBeInTheDocument()
  })

  it('⚠️ says nothing on a U8 TRAINING session either', () => {
    // The note describes what happens on a match weekend. On a Tuesday evening
    // session it would be answering a question nobody asked, on the screen a
    // parent opens most often.
    open(U8, fixture(U8, { type: 'training', opponent: null }))
    expect(screen.queryByTestId('squad-format-note')).not.toBeInTheDocument()
  })

  it('⚠️ says nothing when the squad row has not loaded', () => {
    // squadFormat fails open on an unknown name, so a missing `team` prop shows
    // no card rather than the wrong age group's format.
    render(<EventDetail event={fixture(U8)} team={undefined} onClose={vi.fn()} />)
    expect(screen.queryByTestId('squad-format-note')).not.toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('MatchSheet — the route is linkable, so the screen re-checks', () => {
  function mount(team) {
    getEventMock.mockResolvedValue(fixture(team))
    provide([{ id: 'm-c', role: 'coach', status: 'active', team_id: team.id }])
    render(
      <MemoryRouter
        initialEntries={[`/match-sheet/e-${team.id}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/match-sheet/:eventId" element={<MatchSheet />} />
          <Route path="/schedule" element={<div>Schedule marker</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('⚠️ refuses a pasted U10 URL with a REASON, not a "not authorised"', async () => {
    // The coach is perfectly entitled to edit this squad. There is simply no
    // sheet — and telling them they lack permission would send them to an admin
    // to fix something that is not broken.
    mount(U10)
    const card = await screen.findByTestId('match-sheet-not-required')
    expect(card).toHaveTextContent(/U11 and above/i)
    expect(card).not.toHaveTextContent(/only the coaches/i)
  })

  it('⚠️ still opens the real sheet for U14 — the control', async () => {
    mount(U14B)
    expect(
      await screen.findByRole('heading', { name: /official match result sheet/i }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('match-sheet-not-required')).not.toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('YouthDashboard — the Club Youth Manager’s queue', () => {
  function mount() {
    provide(ADMIN_YOUTH)
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <YouthDashboard />
      </MemoryRouter>,
    )
  }

  it('⚠️ leaves the minis out — a row that could never be ticked off', async () => {
    // Left in, a U8 friendly sat here reading "Not started" for ever and then
    // "Overdue", which is a queue that cannot be emptied and a badge that
    // teaches the Youth Manager to ignore the real ones.
    listEventsMock.mockResolvedValue([fixture(U8), fixture(U10), fixture(U14B)])
    mount()

    await waitFor(() => expect(screen.getAllByTestId('youth-match-row')).toHaveLength(1))
    const rows = screen.getAllByTestId('youth-match-row')
    expect(rows[0]).toHaveTextContent('U14B Contact')
  })

  it('says out loud that the list starts at U11', async () => {
    // Without this the list is simply missing matches the Youth Manager knows
    // are in the schedule, with no way to tell a rule from a bug.
    listEventsMock.mockResolvedValue([fixture(U14B)])
    mount()
    expect(await screen.findByText(/U11 and up/i)).toBeInTheDocument()
  })

  it('⚠️ KEEPS a fixture whose squad did not resolve', async () => {
    // isMinisTeam answers false for a blank name, so an unresolvable squad
    // still shows up needing a sheet. A fixture that quietly vanished is the
    // worse failure: nobody goes looking for a row they never saw.
    listEventsMock.mockResolvedValue([fixture({ id: 't-gone', name: 'Gone' })])
    mount()
    await waitFor(() => expect(screen.getAllByTestId('youth-match-row')).toHaveLength(1))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('EventForm — there is no league below U11', () => {
  function open(event = null) {
    provide()
    render(<EventForm event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
    return userEvent.setup()
  }

  const competition = () => screen.getByLabelText(/^competition$/i)
  const pickSquad = (user, team) =>
    user.selectOptions(screen.getByLabelText(/age group/i), team.id)

  it('⚠️ offers no League option on a U8 fixture, and says why', async () => {
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U8)

    expect(
      within_(competition()).queryByRole('option', { name: 'League' }),
    ).not.toBeInTheDocument()
    // Tournament survives — U9/U10 festivals are real, and so is ADHJRT.
    expect(within_(competition()).getByRole('option', { name: 'Tournament' })).toBeInTheDocument()
    expect(screen.getByTestId('event-form-no-league')).toHaveTextContent(/starts at U11/i)
  })

  it('⚠️ DOES offer it on U14 — the control', async () => {
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U14B)

    expect(within_(competition()).getByRole('option', { name: 'League' })).toBeInTheDocument()
    expect(screen.queryByTestId('event-form-no-league')).not.toBeInTheDocument()
  })

  it('drops the League team and Tier fields for the minis', async () => {
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U14B)
    expect(screen.getByLabelText(/league team/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^tier$/i)).toBeInTheDocument()

    await pickSquad(user, U10)
    expect(screen.queryByLabelText(/league team/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^tier$/i)).not.toBeInTheDocument()
  })

  it('⚠️ MOVES WITH THE AGE GROUP DROPDOWN, both ways', async () => {
    // Derived from the chosen squad on every render rather than decided once
    // when the sheet opened — so correcting a mis-filed fixture works in the
    // same sitting, without a save and a reopen.
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U8)
    expect(within_(competition()).queryByRole('option', { name: 'League' })).not.toBeInTheDocument()

    await pickSquad(user, U14B)
    expect(within_(competition()).getByRole('option', { name: 'League' })).toBeInTheDocument()
  })

  it('⚠️ a U10 fixture ALREADY filed as a league match keeps its controls', async () => {
    // The care that matters. Hiding a control over a value that is really
    // stored would make it uneditable and invisible at once — the person who
    // came to correct the mistake would find nothing wrong. So the field a
    // legacy row is HOLDING stays, and clearing it is what makes it go away.
    listLeagueTeamsMock.mockResolvedValue([ADHQ2])
    open(fixture(U10, { competition_type: 'league', round: 4, league_team_id: 'lt-2', tier: 'B' }))

    await waitFor(() =>
      expect(within_(competition()).getByRole('option', { name: 'League' })).toBeInTheDocument(),
    )
    expect(screen.getByLabelText(/league team/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^tier$/i)).toBeInTheDocument()
    // The round only ever renders alongside a League competition type, so its
    // presence here proves the whole legacy path is intact rather than the
    // dropdown alone.
    expect(screen.getByLabelText(/^round$/i)).toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('EventForm — U6 and U7 record no score', () => {
  // Jay, 15 Aug 2026, asked directly: "i would say keep scoring for U8/U9/U10".
  // ⚠️ THE BOUNDARY IS 8, WHICH IS NOT WHERE EITHER OTHER AGE RULE FALLS. U8 is
  // Mighty Minis AND has no league AND no match sheet — and still scores. That
  // is why it gets its own constant, and why the U8 case below is a control
  // rather than a duplicate of the U14 one.
  const U6 = { id: 't-u6', club_id: CLUB, name: 'U6 Tag', sort_order: 1 }
  const TEAMS_WITH_U6 = [U6, U8, U10, U14B]

  function open(event = null, teams = TEAMS_WITH_U6) {
    provide(ADMIN, teams)
    render(<EventForm event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
    return userEvent.setup()
  }

  const scoreBox = () => screen.queryByLabelText(/quins score/i)
  const pickSquad = (user, team) =>
    user.selectOptions(screen.getByLabelText(/age group/i), team.id)

  it('⚠️ offers no score boxes on a U6 fixture', async () => {
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U6)

    expect(scoreBox()).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/opposition score/i)).not.toBeInTheDocument()
  })

  it('⚠️ DOES offer them at U8 — the control, and the boundary', async () => {
    // U8 is the case that proves this is its own rule: everything ELSE about U8
    // is simplified, and the score survives. If someone folds this threshold
    // into MINIS_MAX_AGE or MIGHTY_MINIS_MAX_AGE, this is the test that fails.
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U8)

    expect(scoreBox()).toBeInTheDocument()
    expect(screen.queryByTestId('event-form-no-league')).toBeInTheDocument()
  })

  it('U9/U10 keep their scores too', async () => {
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U10)
    expect(scoreBox()).toBeInTheDocument()
  })

  it('⚠️ moves with the age group dropdown, both ways', async () => {
    const user = open()
    await user.click(screen.getByRole('radio', { name: 'Match' }))
    await pickSquad(user, U6)
    expect(scoreBox()).not.toBeInTheDocument()

    await pickSquad(user, U8)
    expect(scoreBox()).toBeInTheDocument()
  })

  it('⚠️ a U6 fixture ALREADY holding a score keeps its boxes', async () => {
    // Same escape hatch as the league fields: hiding a control over a stored
    // value strands it. No such fixture exists — measured against the live
    // database the day this shipped, U6 and U7 have no fixtures at all — so
    // this is insurance, and it is cheap.
    open(fixture(U6, { result_us: 15, result_them: 10 }))
    await waitFor(() => expect(scoreBox()).toBeInTheDocument())
  })
})

// A <select> is not a container RTL's `within` narrows usefully by role on its
// own, so this wraps the element and queries its options. Kept local: one file
// needs it and src/ does not.
function within_(select) {
  return {
    getByRole: (_role, { name }) => {
      const found = [...select.options].find((option) => option.textContent === name)
      if (!found) throw new Error(`No option named "${name}" in the select`)
      return found
    },
    queryByRole: (_role, { name }) =>
      [...select.options].find((option) => option.textContent === name) ?? null,
  }
}
