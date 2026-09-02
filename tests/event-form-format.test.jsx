import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from './helpers/pickDate.js'

// Format on the fixture (claude/plans/2026-09-02-fixture-format.md). The
// rule: a league match is 15 and is not asked; a tournament or friendly on a
// U11+ squad asks, pre-selecting the squad's default; a minis squad is never
// asked. Every positive here has its opposite as a control.

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
const U18B = { id: 't-u18b', club_id: CLUB_ID, name: 'U18B Contact', sort_order: 14 }
const U18B_TWELVES = { ...U18B, id: 't-u18b-12', default_format: 12 }
const U8 = { id: 't-u8', club_id: CLUB_ID, name: 'U8 Tag', sort_order: 3 }
const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null }]

function renderForm({ event = null, teams = [U18B], initialKind = null, duplicate = false, strict = false } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onSaved = vi.fn()
  const tree = (
    <EventForm
      event={event}
      initialKind={initialKind}
      duplicate={duplicate}
      onClose={() => {}}
      onSaved={onSaved}
    />
  )
  const result = render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  return { user: userEvent.setup(), onSaved, unmount: result.unmount }
}

beforeEach(() => {
  vi.clearAllMocks()
  listLeagueTeamsMock.mockResolvedValue([])
  upsertEventMock.mockImplementation(async (row) => ({ id: 'e-new', ...row }))
})

// Same shape as fillMatch in tests/event-form-competition.test.jsx: opponent,
// date, and BOTH times — time is a required field for a match unless TBD/all
// day, so a fillMatchBasics that skips it would block Save silently rather
// than exercising the format control.
async function fillMatchBasics(user) {
  await user.type(screen.getByLabelText(/opponent/i), 'Harness Exiles')
  const time = document.getElementById('event-time')
  const end = document.getElementById('event-end-time')
  await pickDate(user, '2026-10-10')
  await user.clear(time)
  await user.type(time, '09:00')
  await user.clear(end)
  await user.type(end, '10:30')
}

const submit = (user) => user.click(screen.getByRole('button', { name: /^(save|add event|create)/i }))

describe('fixture format on the event form', () => {
  it('a tournament on a U11+ squad offers 7s/10s/12s/15s, pre-selecting 15, and writes the pick', async () => {
    const { user } = renderForm()
    await fillMatchBasics(user)
    await user.selectOptions(screen.getByLabelText(/competition/i), 'tournament')
    const group = screen.getByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '15s' })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: '7s' }))
    await submit(user)
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ competition_type: 'tournament', format: 7 })
  })

  it("pre-selects the squad's usual format for a tournament", async () => {
    const { user } = renderForm({ teams: [U18B_TWELVES] })
    await fillMatchBasics(user)
    await user.selectOptions(screen.getByLabelText(/competition/i), 'tournament')
    const group = screen.getByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '12s' })).toBeChecked()
    // CONTROL: 15 is NOT checked here — otherwise "pre-selects" is untested.
    expect(within(group).getByRole('radio', { name: '15s' })).not.toBeChecked()
  })

  it('a league match hides the control and writes 15 whatever was picked before', async () => {
    const { user } = renderForm()
    await fillMatchBasics(user)
    await user.selectOptions(screen.getByLabelText(/competition/i), 'tournament')
    await user.click(within(screen.getByRole('group', { name: /format/i })).getByRole('radio', { name: '7s' }))
    await user.selectOptions(screen.getByLabelText(/competition/i), 'league')
    expect(screen.queryByRole('group', { name: /format/i })).toBeNull()
    await submit(user)
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ competition_type: 'league', format: 15 })
  })

  it('a friendly asks too, and a minis squad is never asked and writes null', async () => {
    const first = renderForm()
    await fillMatchBasics(first.user)
    // "Neither — a friendly" is the default competition.
    expect(screen.getByRole('group', { name: /format/i })).toBeInTheDocument()
    // Unmounted before the minis form renders, so there is only ever one
    // "Save" button and one format group on screen for the queries below.
    first.unmount()

    const minis = renderForm({ teams: [U8] })
    await fillMatchBasics(minis.user)
    expect(screen.queryByRole('group', { name: /format/i })).toBeNull()
    await submit(minis.user)
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    // CONTROL: a non-minis squad writes the picked format, not null — see
    // "a tournament on a U11+ squad …" above, which asserts `format: 7`.
    expect(upsertEventMock.mock.calls.at(-1)[0]).toMatchObject({ format: null })
  })

  it('reopening a 10s fixture shows 10s checked, not the squad default', async () => {
    const event = {
      id: 'e-1', club_id: CLUB_ID, team_id: 't-u18b-12', type: 'match',
      competition_type: 'tournament', competition: 'Harness Sevens', format: 10,
      opponent: 'Harness Exiles', home: true, starts_at: '2026-10-10T05:00:00.000Z',
    }
    renderForm({ event, teams: [U18B_TWELVES] })
    const group = await screen.findByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '10s' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: '12s' })).not.toBeChecked()
  })

  it('a training session writes no format at all', async () => {
    const { user } = renderForm({ initialKind: 'training' })
    await user.type(screen.getByLabelText(/title/i), 'Harness training')
    const time = document.getElementById('event-time')
    const end = document.getElementById('event-end-time')
    await pickDate(user, '2026-10-10')
    await user.clear(time)
    await user.type(time, '17:00')
    await user.clear(end)
    await user.type(end, '18:00')
    await submit(user)
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ format: null })
  })

  // ⚠️ THE BUG THIS GUARDS: a duplicate is NOT editing (see the `editing` flag
  // in EventForm.jsx), so the "follow the squad's default" effect used to fire
  // on MOUNT for a duplicate too and stamp the squad's default straight over
  // the format initialValues deliberately carried from the original row. A 7s
  // tournament fixture duplicated onto a squad whose default is 15 would
  // silently reopen as 15s.
  it('a duplicate keeps the ORIGINAL fixture\'s format, not the squad default', async () => {
    const event = {
      id: 'e-1', club_id: CLUB_ID, team_id: 't-u18b-12', type: 'match',
      competition_type: 'tournament', competition: 'Harness Sevens', format: 7,
      opponent: 'Harness Exiles', home: true, starts_at: '2026-10-10T05:00:00.000Z',
    }
    renderForm({ event, teams: [U18B_TWELVES], duplicate: true })
    const group = await screen.findByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '7s' })).toBeChecked()
    // CONTROL: the squad's default (12s) is NOT what shows — otherwise the
    // carried format is untested and this is just re-asserting the default.
    expect(within(group).getByRole('radio', { name: '12s' })).not.toBeChecked()
  })

  // ⚠️ StrictMode double-invokes a cleanup-less effect synchronously at mount
  // (call 1, throwaway; call 2, the "real" one) — an `if` that merely eats
  // the FIRST call sees the ref already consumed on the second and runs
  // anyway, reintroducing the exact bug the guard exists to prevent in
  // `npm run dev` (main.jsx renders inside <React.StrictMode>). This is the
  // same duplicate scenario as the test above, rendered under StrictMode.
  it('a duplicate keeps the ORIGINAL fixture\'s format under StrictMode double-invoke', async () => {
    const event = {
      id: 'e-1', club_id: CLUB_ID, team_id: 't-u18b-12', type: 'match',
      competition_type: 'tournament', competition: 'Harness Sevens', format: 7,
      opponent: 'Harness Exiles', home: true, starts_at: '2026-10-10T05:00:00.000Z',
    }
    renderForm({ event, teams: [U18B_TWELVES], duplicate: true, strict: true })
    const group = await screen.findByRole('group', { name: /format/i })
    expect(within(group).getByRole('radio', { name: '7s' })).toBeChecked()
    // CONTROL: the squad's default (12s) is NOT what shows.
    expect(within(group).getByRole('radio', { name: '12s' })).not.toBeChecked()
  })
})

// ── Tournament container: the container ASKS the day's format, and its games
//    (AddGameForm.jsx) inherit it — so the container itself must write the
//    picked format, not null. CONTROL alongside it that the save really is a
//    tournament container, so the format assertion is reading the right
//    payload, and a second CONTROL that a container with nothing picked
//    writes 15 like any other unstated match. ─────────────────────────────
describe('fixture format — tournament container', () => {
  it('a tournament container writes the picked format', async () => {
    const { user } = renderForm({ initialKind: 'tournament' })
    await user.selectOptions(screen.getByLabelText('Tournament'), 'ADHJRT')
    await pickDate(user, '2026-10-10')
    await user.type(screen.getByLabelText('Time'), '09:00')
    await user.type(screen.getByLabelText('End time'), '15:00')
    const group = screen.getByRole('group', { name: /format/i })
    await user.click(within(group).getByRole('radio', { name: '7s' }))
    await user.click(screen.getByRole('button', { name: /add tournament/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    // CONTROL: this really is the tournament-container save.
    expect(written).toMatchObject({ competition_type: 'tournament' })
    expect(written.format).toBe(7)
  })

  // CONTROL: a container where nothing was picked writes 15, the same
  // unstated default as any other non-league match — not null.
  it('a tournament container with nothing picked writes 15', async () => {
    const { user } = renderForm({ initialKind: 'tournament' })
    await user.selectOptions(screen.getByLabelText('Tournament'), 'ADHJRT')
    await pickDate(user, '2026-10-10')
    await user.type(screen.getByLabelText('Time'), '09:00')
    await user.type(screen.getByLabelText('End time'), '15:00')
    await user.click(screen.getByRole('button', { name: /add tournament/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    expect(written).toMatchObject({ competition_type: 'tournament' })
    expect(written.format).toBe(15)
  })
})
