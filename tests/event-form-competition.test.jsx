import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Competition is a CHOICE, not a free-text box — Jay, 12 Aug 2026: "a way to
// select in competition either league or tournament, for league it should then
// give the option for R1-8, for tournament it should give the options of
// ADHJRT, Dubai Youth Festival, Al Ain Tournament, Small Blacks Tournament and
// then the possibility to customize the tournament name".
//
// PROCESS ZONE, same as the other EventForm files: this one submits real
// fixtures and a zone bug is invisible under a UTC runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const listLeagueTeamsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: async () => [],
  deleteEvent: async () => {},
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: (...args) => listLeagueTeamsMock(...args),
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM = { id: 't-u14b', club_id: CLUB_ID, name: 'U14B Contact', sort_order: 9 }
const ADHQ2 = { id: 'lt-2', team_id: 't-u14b', rcm_name: 'ADHQ2', division: 'B', is_active: true }
const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null }]

function renderForm({ event = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<EventForm event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
  return { user: userEvent.setup() }
}

async function fillMatch(user) {
  await user.type(screen.getByLabelText(/opponent/i), 'Dubai Exiles')
  const date = document.getElementById('event-date')
  const time = document.getElementById('event-time')
  const end = document.getElementById('event-end-time')
  await user.clear(date); await user.type(date, '2026-09-12')
  await user.clear(time); await user.type(time, '09:00')
  await user.clear(end); await user.type(end, '10:30')
}

const submit = (user) => user.click(screen.getByRole('button', { name: /^(save|add event|create)/i }))
const payload = () => upsertEventMock.mock.calls[0][0]

beforeEach(() => {
  vi.clearAllMocks()
  listLeagueTeamsMock.mockResolvedValue([ADHQ2])
  upsertEventMock.mockResolvedValue({ id: 'e-new' })
})

describe('Competition — league or tournament', () => {
  it('⚠️ defaults to "Neither — a friendly", which is a real answer', async () => {
    // Friendlies are common. Nothing may read the blank as "assume league" —
    // the same rule league_team_id carries.
    renderForm()
    const select = await screen.findByLabelText(/^competition$/i)
    expect(select).toHaveValue('')
    expect(within(select).getByText(/neither/i)).toBeInTheDocument()
  })

  it('⚠️ is no longer a free-text box', async () => {
    // It was `<input type="text" placeholder="e.g. UAE Youth League">`, which
    // meant every coach spelled the same competition differently.
    renderForm()
    const select = await screen.findByLabelText(/^competition$/i)
    expect(select.tagName).toBe('SELECT')
  })

  // ⚠️ WIDENED 14 Aug 2026 (Jay): R0 was added, so this used to assert that
  // "Round 0" was ABSENT and now asserts it is present. The 9 is unchanged and
  // is the half of this test still doing its original job — the set is closed,
  // and a ninth round is a conversation rather than a value to accept silently.
  // The empty option's wording moved from "Not set" to "TBD" in the same
  // breath, to match the competition dropdown and the pitch picker.
  it('offers Round 0-8 for a league fixture, and nothing outside that', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'league')

    const round = screen.getByLabelText(/^round$/i)
    expect(round.tagName).toBe('SELECT')
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(within(round).getByText(`Round ${n}`)).toBeInTheDocument()
    }
    expect(within(round).queryByText('Round 9')).not.toBeInTheDocument()
    // ⚠️ Not knowing the round yet is normal and must be sayable.
    expect(within(round).getByText(/TBD/i)).toBeInTheDocument()
  })

  it('offers the four regular tournaments plus an escape hatch', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'tournament')

    const pick = screen.getByLabelText(/^tournament$/i)
    for (const name of ['ADHJRT', 'Dubai Youth Festival', 'Al Ain Tournament', 'Small Blacks Tournament']) {
      expect(within(pick).getByText(name)).toBeInTheDocument()
    }
    expect(within(pick).getByText(/something else/i)).toBeInTheDocument()
  })

  it('⚠️ shows Round only for League and Tournament only for Tournament', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    const competition = screen.getByLabelText(/^competition$/i)

    expect(screen.queryByLabelText(/^round$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^tournament$/i)).not.toBeInTheDocument()

    await user.selectOptions(competition, 'league')
    expect(screen.getByLabelText(/^round$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^tournament$/i)).not.toBeInTheDocument()

    await user.selectOptions(competition, 'tournament')
    expect(screen.queryByLabelText(/^round$/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^tournament$/i)).toBeInTheDocument()
  })

  it('saves a league fixture as type league with its round', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await fillMatch(user)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'league')
    await user.selectOptions(screen.getByLabelText(/^round$/i), '4')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(payload()).toMatchObject({ competition_type: 'league', round: 4, competition: null })
  })

  it('saves a tournament with its name and no round', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await fillMatch(user)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'tournament')
    await user.selectOptions(screen.getByLabelText(/^tournament$/i), 'ADHJRT')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(payload()).toMatchObject({ competition_type: 'tournament', competition: 'ADHJRT', round: null })
  })

  it('saves a custom tournament name through the escape hatch', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await fillMatch(user)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'tournament')
    await user.selectOptions(screen.getByLabelText(/^tournament$/i), '__other_tournament__')
    await user.type(screen.getByLabelText(/tournament name/i), 'Sharjah Sevens')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(payload()).toMatchObject({ competition_type: 'tournament', competition: 'Sharjah Sevens' })
  })

  it('⚠️ SWITCHING TYPE DROPS THE OTHER SIDE\'S ANSWER, in the form AND the save', async () => {
    // League and Tournament are exclusive. A round left over from League, or a
    // name left over from Tournament, would otherwise be written against a
    // fixture that is no longer either.
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await fillMatch(user)

    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'league')
    await user.selectOptions(screen.getByLabelText(/^round$/i), '4')
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'tournament')
    await user.selectOptions(screen.getByLabelText(/^tournament$/i), 'ADHJRT')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(payload().round).toBeNull()
    expect(payload().competition).toBe('ADHJRT')
  })

  it('⚠️ a friendly writes NULL for all three', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await fillMatch(user)
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(payload()).toMatchObject({ competition_type: null, competition: null, round: null })
  })

  it('⚠️ offers none of it on a TRAINING session', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/^competition$/i)
    await user.click(screen.getByRole('radio', { name: 'Training' }))

    expect(screen.queryByLabelText(/^competition$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^round$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^tournament$/i)).not.toBeInTheDocument()
  })

  it('⚠️ reads an OLD row (competition text, no type) as a tournament, keeping the text', async () => {
    // `competition` was free text from v1 until today, so every fixture
    // predating the column holds a string and a null type. Showing "neither"
    // would silently orphan what somebody typed on the next save.
    renderForm({
      event: {
        id: 'e-old', club_id: CLUB_ID, team_id: 't-u14b', type: 'match',
        opponent: 'Dubai Exiles', home: true, venue: 'Zayed Sports City, Abu Dhabi',
        starts_at: '2026-09-12T05:00:00.000Z', ends_at: '2026-09-12T06:30:00.000Z',
        competition: 'UAE Youth League', competition_type: null,
        result_us: null, result_them: null,
      },
    })

    await waitFor(() => expect(screen.getByLabelText(/^competition$/i)).toHaveValue('tournament'))
    // Not one of the four, so it lands in the escape hatch with the text intact.
    expect(screen.getByLabelText(/tournament name/i)).toHaveValue('UAE Youth League')
  })

  it('opens an existing league fixture on League with its round', async () => {
    renderForm({
      event: {
        id: 'e-1', club_id: CLUB_ID, team_id: 't-u14b', type: 'match',
        opponent: 'Dubai Exiles', home: true, venue: 'Zayed Sports City, Abu Dhabi',
        starts_at: '2026-09-12T05:00:00.000Z', ends_at: '2026-09-12T06:30:00.000Z',
        competition: null, competition_type: 'league', round: 4,
        league_team_id: 'lt-2', result_us: null, result_them: null,
      },
    })

    await waitFor(() => expect(screen.getByLabelText(/^competition$/i)).toHaveValue('league'))
    expect(screen.getByLabelText(/^round$/i)).toHaveValue('4')
  })
})
