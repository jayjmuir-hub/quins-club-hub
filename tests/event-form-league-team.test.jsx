import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Task 6 of claude/plans/2026-08-11-league-teams-implementation.md — a match
// can record WHICH OF THE CLUB'S TEAMS played it, and in which round.
//
// PROCESS ZONE. America/New_York, same as tests/event-form.test.jsx and
// tests/multi-squad-and-pitch.test.jsx: this file submits real fixtures, and a
// zone bug is invisible under a UTC runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const insertEventsMock = vi.fn()
const listLeagueTeamsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: (...args) => insertEventsMock(...args),
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
// ⚠️ The letter is GENDER, not division — U14B is U14 BOYS. Named that way on
// purpose so a reader of this file cannot mistake a squad name for a division.
const TEAM_U14B = { id: 't-u14b', club_id: CLUB_ID, name: 'U14B Contact', sort_order: 9 }
const TEAM_U16B = { id: 't-u16b', club_id: CLUB_ID, name: 'U16B Contact', sort_order: 11 }
const TEAMS = [TEAM_U14B, TEAM_U16B]

const ADHQ1 = { id: 'lt-1', team_id: 't-u14b', rcm_name: 'ADHQ1', division: 'A', is_active: true }
const ADHQ2 = { id: 'lt-2', team_id: 't-u14b', rcm_name: 'ADHQ2', division: 'B', is_active: true }
const ADHQ_U16 = { id: 'lt-9', team_id: 't-u16b', rcm_name: 'ADHQ-U16', division: 'A', is_active: true }

const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null }]

function renderForm({ event = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onSaved = vi.fn()
  render(<EventForm event={event} onClose={vi.fn()} onSaved={onSaved} />)
  return { onSaved, user: userEvent.setup() }
}

/** Fills the fields a match needs, leaving the league fields alone. */
async function fillMatch(user) {
  await user.type(screen.getByLabelText(/opponent/i), 'Dubai Exiles')
  const date = document.getElementById('event-date')
  const time = document.getElementById('event-time')
  const end = document.getElementById('event-end-time')
  await user.clear(date)
  await user.type(date, '2026-09-12')
  await user.clear(time)
  await user.type(time, '09:00')
  await user.clear(end)
  await user.type(end, '10:30')
}

const submit = (user) => user.click(screen.getByRole('button', { name: /^(save|add event|create)/i }))

beforeEach(() => {
  vi.clearAllMocks()
  // Scoped by team_id, exactly as the real function is.
  listLeagueTeamsMock.mockImplementation(async ({ teamId } = {}) => {
    if (teamId === 't-u14b') return [ADHQ1, ADHQ2]
    if (teamId === 't-u16b') return [ADHQ_U16]
    return []
  })
  upsertEventMock.mockResolvedValue({ id: 'e-new' })
  insertEventsMock.mockResolvedValue([{ id: 'e-new' }])
})

describe('EventForm — the league team field', () => {
  it('⚠️ offers ONLY the league teams belonging to the chosen squad', async () => {
    // A club-wide list would let a U14 fixture be filed under a U16 team, and
    // the governing body receives that as a wrong RESULT rather than as an
    // obvious mistake. The guard is listLeagueTeams' teamId argument.
    renderForm()

    const select = await screen.findByLabelText(/league team/i)
    await waitFor(() => expect(within(select).getByText('ADHQ2 — Div B')).toBeInTheDocument())
    expect(within(select).getByText('ADHQ1 — Div A')).toBeInTheDocument()
    expect(within(select).queryByText(/ADHQ-U16/)).not.toBeInTheDocument()
    expect(listLeagueTeamsMock).toHaveBeenCalledWith({ teamId: 't-u14b' })
  })

  it('⚠️ defaults to "Not a league match", which is a real answer', async () => {
    // Friendlies and festivals are matches with no league team, and they are
    // the common case. Null league_team_id is what makes a fixture not a
    // league one; nothing may guess otherwise from the type or the squad.
    renderForm()

    const select = await screen.findByLabelText(/league team/i)
    expect(select).toHaveValue('')
    expect(within(select).getByText('Not a league match')).toBeInTheDocument()
  })

  it('⚠️ hides Round until a league team is chosen', async () => {
    // A round without a league team is meaningless — fixtureLabel ignores it
    // and the save nulls it — so offering the box would invite somebody to
    // fill in a field that is then thrown away.
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    expect(screen.queryByLabelText(/^round$/i)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/league team/i), 'lt-2')
    expect(screen.getByLabelText(/^round$/i)).toBeInTheDocument()
  })

  it('saves league_team_id and round on the event', async () => {
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillMatch(user)
    await user.selectOptions(screen.getByLabelText(/league team/i), 'lt-2')
    await user.type(screen.getByLabelText(/^round$/i), '4')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      league_team_id: 'lt-2',
      round: 4,
      team_id: 't-u14b',
    })
  })

  it('⚠️ writes NULL for both when the fixture is not a league match', async () => {
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillMatch(user)
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      league_team_id: null,
      round: null,
    })
  })

  it('⚠️ CHANGING THE SQUAD CLEARS THE LEAGUE TEAM', async () => {
    // The bug this field is most likely to have: pick U14B, pick ADHQ2, then
    // realise it was the U16 fixture and change the Age group. Without the
    // clear the select still holds a U14 team's id while showing U16's
    // options, and the save writes it.
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await user.selectOptions(screen.getByLabelText(/league team/i), 'lt-2')
    expect(screen.getByLabelText(/league team/i)).toHaveValue('lt-2')

    await user.selectOptions(screen.getByLabelText(/age group/i), 't-u16b')

    await waitFor(() => expect(screen.getByLabelText(/league team/i)).toHaveValue(''))
    // And the round went with it — a round belongs to the team that played it.
    expect(screen.queryByLabelText(/^round$/i)).not.toBeInTheDocument()
  })

  it('⚠️ a round left behind is NOT written once the league team is cleared', async () => {
    // The same rule fixtureLabel enforces when rendering, applied to the
    // column: no league team means no round, whatever the input still holds.
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillMatch(user)
    await user.selectOptions(screen.getByLabelText(/league team/i), 'lt-2')
    await user.type(screen.getByLabelText(/^round$/i), '4')
    await user.selectOptions(screen.getByLabelText(/league team/i), '')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      league_team_id: null,
      round: null,
    })
  })

  it('⚠️ offers nothing on a TRAINING session', async () => {
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await user.click(screen.getByRole('radio', { name: 'Training' }))

    expect(screen.queryByLabelText(/league team/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^round$/i)).not.toBeInTheDocument()
  })

  it('opens an existing league fixture with its team and round intact', async () => {
    renderForm({
      event: {
        id: 'e-1',
        club_id: CLUB_ID,
        team_id: 't-u14b',
        type: 'match',
        opponent: 'Dubai Exiles',
        home: true,
        venue: 'Zayed Sports City, Abu Dhabi',
        starts_at: '2026-09-12T05:00:00.000Z',
        ends_at: '2026-09-12T06:30:00.000Z',
        league_team_id: 'lt-2',
        round: 4,
        result_us: null,
        result_them: null,
      },
    })

    // ⚠️ Must NOT be cleared on mount — the squad-change effect is keyed off a
    // ref for exactly this case.
    await waitFor(() => expect(screen.getByLabelText(/league team/i)).toHaveValue('lt-2'))
    expect(screen.getByLabelText(/^round$/i)).toHaveValue(4)
  })

  it('says so when the squad has no league teams yet', async () => {
    listLeagueTeamsMock.mockResolvedValue([])
    renderForm()

    expect(await screen.findByText(/no league teams yet/i)).toBeInTheDocument()
  })

  it('⚠️ still lets a fixture be saved when the league-team list cannot be read', async () => {
    // Same rule the pitch list follows: a failed load falls back to "Not a
    // league match", which is the correct answer for every fixture that is not
    // one, rather than refusing to let anyone save.
    listLeagueTeamsMock.mockRejectedValue(new Error('Network unreachable'))
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillMatch(user)
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ league_team_id: null, round: null })
  })
})
