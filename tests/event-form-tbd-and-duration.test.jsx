import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Jay, 14 Aug 2026, three asks on the event form:
//   - a TBD option on the competition dropdown
//   - R0 on the round dropdown, and TBD wording for "not known yet"
//   - a duration that fills the end time in for you
//
// PROCESS ZONE, same as every other EventForm file: this one submits real
// fixtures and a club-zone bug is invisible under a UTC runner. America/New_York
// is four hours the OTHER side of UTC from Abu Dhabi, so a placeholder midnight
// converted through the browser's zone instead of the club's lands on the wrong
// DAY — which is exactly the failure the TBD start time could introduce.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  updateSeriesFrom: async () => {},
  setSeriesTimeFrom: async () => {},
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: async () => [],
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM = { id: 't-u14b', club_id: CLUB_ID, name: 'U14B Contact', sort_order: 9 }
const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null }]

function renderForm({ event = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<EventForm event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
  return userEvent.setup()
}

/** Fill the fields every match needs, so a test can assert on one thing. */
async function fillMatchBasics(user, { date = '2026-09-12' } = {}) {
  await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
  const dateInput = screen.getByLabelText('Date')
  await user.clear(dateInput)
  await user.type(dateInput, date)
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertEventMock.mockResolvedValue({ id: 'e-1' })
})

describe('competition TBD', () => {
  it('offers TBD as a separate answer from "neither — a friendly"', () => {
    renderForm()
    const select = screen.getByLabelText('Competition')
    const values = [...select.options].map((option) => option.value)
    // ⚠️ BOTH, AND THEY ARE DIFFERENT. '' is a friendly (an answer); 'tbd' is
    // the absence of one. A change that collapsed them would still leave four
    // options here, so the values are what is asserted, not the count.
    expect(values).toContain('')
    expect(values).toContain('tbd')
    expect(values).toContain('league')
    expect(values).toContain('tournament')
  })

  it('saves competition_type "tbd", with no tournament name and no round', async () => {
    const user = renderForm()
    await fillMatchBasics(user)
    await user.type(screen.getByLabelText('Time'), '15:00')
    await user.type(screen.getByLabelText('End time'), '16:30')
    await user.selectOptions(screen.getByLabelText('Competition'), 'tbd')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.competition_type).toBe('tbd')
    // A TBD competition cannot carry a tournament name or a round — neither
    // question has been answered.
    expect(payload.competition).toBeNull()
    expect(payload.round).toBeNull()
  })

  it('hides the round and tournament fields for TBD', async () => {
    const user = renderForm()
    await user.selectOptions(screen.getByLabelText('Competition'), 'tbd')
    expect(screen.queryByLabelText('Round')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tournament')).not.toBeInTheDocument()
  })
})

describe('round 0', () => {
  it('offers Round 0 through Round 8, plus a TBD option', async () => {
    const user = renderForm()
    await user.selectOptions(screen.getByLabelText('Competition'), 'league')
    const select = screen.getByLabelText('Round')
    const values = [...select.options].map((option) => option.value)
    expect(values).toEqual(['', '0', '1', '2', '3', '4', '5', '6', '7', '8'])
    // The empty option is the "not known yet" one, and its wording changed on
    // 14 Aug from "Not set" to TBD.
    expect(select.options[0].textContent).toMatch(/TBD/i)
  })

  it('SAVES round 0 as the number 0, not as null', async () => {
    // ⚠️ THE WHOLE POINT OF THIS TEST. 0 is falsy in JavaScript, so any
    // truthiness check anywhere on the save path silently turns "Round 0" into
    // "no round" — and it would do it ONLY for round 0, which is the hardest
    // kind of bug to notice.
    const user = renderForm()
    await fillMatchBasics(user)
    await user.type(screen.getByLabelText('Time'), '15:00')
    await user.type(screen.getByLabelText('End time'), '16:30')
    await user.selectOptions(screen.getByLabelText('Competition'), 'league')
    await user.selectOptions(screen.getByLabelText('Round'), '0')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].round).toBe(0)
  })
})

describe('duration', () => {
  it('fills the end time in from the start time', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.selectOptions(screen.getByLabelText('Duration'), '90')
    expect(screen.getByLabelText('End time')).toHaveValue('19:30')
  })

  it('shows the duration that the two times already describe', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.type(screen.getByLabelText('End time'), '20:00')
    expect(screen.getByLabelText('Duration')).toHaveValue('120')
  })

  it('reads as Custom when the gap matches no preset', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.type(screen.getByLabelText('End time'), '19:07')
    expect(screen.getByLabelText('Duration')).toHaveValue('__custom__')
  })

  it('moves the end time when the start moves, keeping the gap', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.selectOptions(screen.getByLabelText('Duration'), '90')
    expect(screen.getByLabelText('End time')).toHaveValue('19:30')

    const timeInput = screen.getByLabelText('Time')
    await user.clear(timeInput)
    await user.type(timeInput, '19:00')
    // Still 90 minutes, not the 30 it would collapse to if the end stayed put.
    expect(screen.getByLabelText('End time')).toHaveValue('20:30')
    expect(screen.getByLabelText('Duration')).toHaveValue('90')
  })

  it('refuses a duration that would run past midnight, and says so', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Time'), '23:00')
    await user.selectOptions(screen.getByLabelText('Duration'), '120')
    // ⚠️ NOT WRAPPED TO 01:00. An event runs on one club calendar day, so a
    // wrapped end is refused on Save — putting it in the box would look accepted
    // and then fail.
    expect(screen.getByLabelText('End time')).toHaveValue('')
    expect(screen.getByRole('alert')).toHaveTextContent(/past midnight/i)
  })
})

describe('tournaments have no opponent', () => {
  // Jay, 14 Aug 2026, from the live schedule. The required Opponent field is
  // what made somebody type "Al Ain Tournament" into it, which then rendered as
  // "Quins vs Al Ain Tournament" everywhere.
  it('saves a tournament with the opponent left blank', async () => {
    const user = renderForm()
    const dateInput = screen.getByLabelText('Date')
    await user.clear(dateInput)
    await user.type(dateInput, '2026-10-10')
    await user.type(screen.getByLabelText('Time'), '09:00')
    await user.type(screen.getByLabelText('End time'), '17:00')
    await user.selectOptions(screen.getByLabelText('Competition'), 'tournament')
    await user.selectOptions(screen.getByLabelText('Tournament'), 'Al Ain Tournament')
    // Deliberately no opponent — the draw is not out yet.
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.competition).toBe('Al Ain Tournament')
    expect(payload.competition_type).toBe('tournament')
    expect(payload.opponent).toBe('')
  })

  it('says the opponent is not needed, without renaming the field', async () => {
    // ⚠️ THE LABEL STAYS "Opponent". It briefly became "Opponent (optional)" for
    // a tournament and broke `getByLabelText('Opponent')` in three unrelated
    // tests — correctly, because a field's accessible name is its identity and
    // should not move because a dropdown elsewhere changed. The guidance lives
    // in the placeholder and the note.
    const user = renderForm()
    await user.selectOptions(screen.getByLabelText('Competition'), 'tournament')
    const opponent = screen.getByLabelText('Opponent')
    expect(opponent).toHaveAttribute('placeholder', expect.stringMatching(/draw is out/i))
    expect(screen.getByText(/don.t need an opponent/i)).toBeInTheDocument()
  })

  it('STILL requires an opponent for an ordinary fixture', async () => {
    // The guard is narrowed to tournaments, not removed. A friendly with no
    // opponent is still an unfinished fixture.
    const user = renderForm()
    await user.type(screen.getByLabelText('Time'), '15:00')
    await user.type(screen.getByLabelText('End time'), '16:30')
    await user.click(screen.getByRole('button', { name: /add event/i }))
    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/highlighted fields/i)
  })
})

describe('start time TBD', () => {
  it('hides the time fields and saves midnight CLUB time with the flag', async () => {
    const user = renderForm()
    await fillMatchBasics(user, { date: '2026-09-12' })
    await user.click(screen.getByRole('checkbox', { name: /kick-off time to be confirmed/i }))

    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('End time')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add event/i }))
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())

    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.time_tbd).toBe(true)
    // ⚠️ MIDNIGHT IN ABU DHABI IS 20:00 UTC THE PREVIOUS DAY. Under this file's
    // America/New_York process zone, a placeholder built through the browser's
    // zone instead of the club's would come out as 04:00Z on the 12th — right
    // day, wrong instant — or worse. This asserts the club conversion.
    expect(payload.starts_at).toBe('2026-09-11T20:00:00.000Z')
    // ⚠️ NULL, AND THE DATABASE AGREES (events_no_end_when_time_tbd). A real
    // finish against a placeholder midnight renders as a 15-hour event.
    expect(payload.ends_at).toBeNull()
  })

  it('saves without a time, which the form would otherwise require', async () => {
    const user = renderForm()
    await fillMatchBasics(user)
    await user.click(screen.getByRole('checkbox', { name: /kick-off time to be confirmed/i }))
    await user.click(screen.getByRole('button', { name: /add event/i }))
    // No "fill in the highlighted fields" — the two time checks are suspended.
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
  })

  it('still requires the date — TBD is about the time, not the day', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.clear(screen.getByLabelText('Date'))
    await user.click(screen.getByRole('checkbox', { name: /kick-off time to be confirmed/i }))
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/highlighted fields/i)
  })

  it('opens an existing TBD fixture with blank times, not the placeholder', async () => {
    // ⚠️ THE TRAP: the stored start IS a real instant (midnight club time). If
    // it prefilled the Time box, unticking TBD would save that midnight as a
    // genuine kick-off nobody chose.
    renderForm({
      event: {
        id: 'e-9',
        type: 'match',
        opponent: 'Dubai Exiles',
        team_id: TEAM.id,
        starts_at: '2026-09-11T20:00:00.000Z',
        ends_at: null,
        time_tbd: true,
      },
    })
    expect(screen.getByRole('checkbox', { name: /kick-off time to be confirmed/i })).toBeChecked()
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument()
  })
})
