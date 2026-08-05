import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Two things that ship together because they are the same form change:
//   - "Also add for" — one session, several age groups, one INDEPENDENT
//     event row each, sharing a group_id (src/screens/EventForm.jsx)
//   - Pitch — a free-text field beside Venue
//
// PROCESS ZONE. America/New_York, same as tests/event-form.test.jsx and
// tests/repeating-events.test.jsx. A fan-out writes the same starts_at to
// every squad's row, and "the same" is only meaningful if it is the right
// instant in the first place — under a UTC runner a zone bug is invisible.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const insertEventsMock = vi.fn()

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

// EventDetail (for the Pitch row) reads availability on mount.
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

import EventForm from '../src/screens/EventForm.jsx'
import EventDetail from '../src/screens/EventDetail.jsx'
import FixtureRow from '../src/components/FixtureRow.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAM_U14 = { id: 't-u14', club_id: CLUB_ID, name: 'U14', sort_order: 9 }
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }
// Deliberately unsorted: visibleTeams sorts, and the fan-out row order has to
// follow the club's sort order rather than this array's.
const TEAMS = [TEAM_U16, TEAM_U12, TEAM_U14]

const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null }]
const COACH_ONE = [{ id: 'm-c', role: 'coach', team_id: 't-u12' }]

const EXISTING_TRAINING = {
  id: 'e-1',
  club_id: CLUB_ID,
  team_id: 't-u12',
  type: 'training',
  title: 'U12 Contact',
  opponent: null,
  home: null,
  venue: 'Zayed Sports City, Abu Dhabi',
  pitch: 'Pitch 4',
  competition: null,
  starts_at: '2026-08-11T14:00:00.000Z',
  result_us: null,
  result_them: null,
}

function renderForm({ memberships = ADMIN, teams = TEAMS, event = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(<EventForm event={event} onClose={onClose} onSaved={onSaved} />)
  return { onSaved, onClose, user: userEvent.setup() }
}

/** A valid one-off training session on 11 Aug 2026 at 18:00 Abu Dhabi. */
async function fillTraining(user) {
  await user.click(screen.getByRole('radio', { name: 'Training' }))
  await user.type(screen.getByLabelText('Title'), 'Pre-season')

  const date = screen.getByLabelText('Date')
  await user.clear(date)
  await user.type(date, '2026-08-11')
  await user.type(screen.getByLabelText('Time'), '18:00')
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertEventMock.mockResolvedValue({ id: 'saved' })
  insertEventsMock.mockImplementation(async (rows) => rows.map((row, i) => ({ ...row, id: `e${i}` })))
})

describe('Also add for — when it is offered', () => {
  it('is offered to an admin adding an event, listing every squad except the chosen one', () => {
    renderForm()

    expect(screen.getByRole('group', { name: 'Also add for' })).toBeInTheDocument()
    // U12 is the chosen Age group, so it is not also an extra.
    expect(screen.queryByRole('checkbox', { name: 'U12' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'U14' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'U16' })).toBeInTheDocument()
  })

  it('is not offered when editing — an existing event belongs to one squad', () => {
    renderForm({ event: EXISTING_TRAINING })

    expect(screen.queryByRole('group', { name: 'Also add for' })).not.toBeInTheDocument()
  })

  it('is not offered to a coach with only one squad', () => {
    renderForm({ memberships: COACH_ONE })

    expect(screen.queryByRole('group', { name: 'Also add for' })).not.toBeInTheDocument()
  })

  it('drops a squad from the extras the moment it becomes the chosen Age group', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('checkbox', { name: 'U14' }))
    expect(screen.getByRole('checkbox', { name: 'U14' })).toBeChecked()

    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')

    // U14 is now the primary squad, so it is no longer an extra — and must
    // not be counted twice.
    expect(screen.queryByRole('checkbox', { name: 'U14' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add event' })).toBeInTheDocument()
  })
})

describe('Also add for — what it writes', () => {
  it('writes one row per squad, in one insert, sharing a group_id', async () => {
    const { user } = renderForm()

    await fillTraining(user)
    await user.click(screen.getByRole('checkbox', { name: 'U14' }))
    await user.click(screen.getByRole('checkbox', { name: 'U16' }))
    await user.click(screen.getByRole('button', { name: 'Add 3 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalled())
    // ONE statement, not three — insertEvents runs a multi-row INSERT in a
    // single implicit transaction, so a refusal rolls the whole thing back
    // rather than leaving one squad with a session the others never got.
    expect(insertEventsMock).toHaveBeenCalledTimes(1)
    expect(upsertEventMock).not.toHaveBeenCalled()

    const rows = insertEventsMock.mock.calls[0][0]
    expect(rows).toHaveLength(3)
    // Primary first, then the extras in the CLUB's sort order, not the order
    // the fixture array happens to be in and not the order they were ticked.
    expect(rows.map((row) => row.team_id)).toEqual(['t-u12', 't-u14', 't-u16'])
  })

  it('gives every row the SAME group_id, not one each', async () => {
    const { user } = renderForm()

    await fillTraining(user)
    await user.click(screen.getByRole('checkbox', { name: 'U14' }))
    await user.click(screen.getByRole('checkbox', { name: 'U16' }))
    await user.click(screen.getByRole('button', { name: 'Add 3 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalled())
    const rows = insertEventsMock.mock.calls[0][0]
    const ids = new Set(rows.map((row) => row.group_id))

    // One id across three rows. A crypto.randomUUID() call inside the map
    // would give three ids, which looks identical in the schedule and is
    // useless to the column's whole purpose.
    expect(ids.size).toBe(1)
    expect([...ids][0]).toEqual(expect.any(String))
    expect([...ids][0]).not.toBeNull()
  })

  it('gives every squad the same instant, read as Abu Dhabi wall-clock', async () => {
    const { user } = renderForm()

    await fillTraining(user)
    await user.click(screen.getByRole('checkbox', { name: 'U14' }))
    await user.click(screen.getByRole('button', { name: 'Add 2 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalled())
    const rows = insertEventsMock.mock.calls[0][0]

    // 18:00 in Abu Dhabi is 14:00Z — NOT 22:00Z, which is what a naive
    // new Date('2026-08-11T18:00') would give under this file's New York zone.
    rows.forEach((row) => expect(row.starts_at).toBe('2026-08-11T14:00:00.000Z'))
    expect(new Set(rows.map((row) => row.starts_at)).size).toBe(1)
  })

  it('carries the same details onto every squad, and each squad its own club_id', async () => {
    const { user } = renderForm()

    await fillTraining(user)
    await user.type(screen.getByLabelText('Pitch'), 'Pitch 3')
    await user.click(screen.getByRole('checkbox', { name: 'U16' }))
    await user.click(screen.getByRole('button', { name: 'Add 2 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalled())
    insertEventsMock.mock.calls[0][0].forEach((row) => {
      expect(row).toMatchObject({
        club_id: CLUB_ID,
        type: 'training',
        title: 'Pre-season',
        pitch: 'Pitch 3',
      })
      // A fanned-out event is not a series. The two columns are mutually
      // exclusive by the guard in handleSubmit; this pins that a row never
      // carries both.
      expect(row.series_id).toBeUndefined()
    })
  })

  it('still writes a single event through upsertEvent when no extras are ticked', async () => {
    const { user } = renderForm()

    await fillTraining(user)
    await user.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(insertEventsMock).not.toHaveBeenCalled()
    // No group_id on a one-squad event: the column means "created alongside
    // other squads", and stamping a lone row would make a group of one.
    expect(upsertEventMock.mock.calls[0][0].group_id).toBeUndefined()
  })
})

describe('Also add for — the row-count guard', () => {
  it('refuses extras combined with a repeat, and writes nothing at all', async () => {
    const { user, onSaved } = renderForm()

    await fillTraining(user)
    await user.click(screen.getByRole('checkbox', { name: 'U14' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tue' }))
    await user.type(screen.getByLabelText('Repeat until'), '2026-12-15')

    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/one age group at a time/i)
    // The point of the guard is the rows that DON'T get written: two squads
    // across a term is hundreds of rows with no undo built.
    expect(insertEventsMock).not.toHaveBeenCalled()
    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('warns in the Repeats section before the user reaches Save', async () => {
    const { user } = renderForm()

    expect(screen.queryByText(/one age group at a time/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'U14' }))

    expect(screen.getByText(/one age group at a time/i)).toBeInTheDocument()
  })

  it('lets a repeat through once the extras are unticked', async () => {
    const { user } = renderForm()

    await fillTraining(user)
    await user.click(screen.getByRole('checkbox', { name: 'U14' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tue' }))
    await user.type(screen.getByLabelText('Repeat until'), '2026-08-25')
    await user.click(screen.getByRole('checkbox', { name: 'U14' })) // untick

    await user.click(screen.getByRole('button', { name: /add 3 events/i }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalled())
    const rows = insertEventsMock.mock.calls[0][0]
    // A series again: three Tuesdays on one squad, series_id set, no group_id.
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((row) => row.team_id))).toEqual(new Set(['t-u12']))
    expect(new Set(rows.map((row) => row.series_id)).size).toBe(1)
    rows.forEach((row) => expect(row.group_id).toBeUndefined())
  })
})

describe('Pitch', () => {
  it('writes the trimmed pitch', async () => {
    const { user } = renderForm({ memberships: COACH_ONE })

    await fillTraining(user)
    await user.type(screen.getByLabelText('Pitch'), '  Pitch 2  ')
    await user.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].pitch).toBe('Pitch 2')
  })

  it('writes null, not an empty string, when no pitch is given', async () => {
    const { user } = renderForm({ memberships: COACH_ONE })

    await fillTraining(user)
    await user.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].pitch).toBeNull()
  })

  it('prefills the pitch when editing, and can clear it back to null', async () => {
    const { user } = renderForm({ memberships: COACH_ONE, event: EXISTING_TRAINING })

    expect(screen.getByLabelText('Pitch')).toHaveValue('Pitch 4')

    await user.clear(screen.getByLabelText('Pitch'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].pitch).toBeNull()
  })

  it('is shown on the detail sheet when set, and the row is absent when not', () => {
    const { rerender } = render(
      <EventDetail event={EXISTING_TRAINING} team={TEAM_U12} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Pitch 4')).toBeInTheDocument()

    rerender(
      <EventDetail event={{ ...EXISTING_TRAINING, pitch: null }} team={TEAM_U12} onClose={vi.fn()} />,
    )
    // Not "Pitch —" on every event created before the column existed.
    expect(screen.queryByText('Pitch')).not.toBeInTheDocument()
  })

  it('rides along with the venue on a fixture row', () => {
    render(<FixtureRow event={EXISTING_TRAINING} teamName="U12" onSelect={vi.fn()} />)

    expect(screen.getByText('Zayed Sports City, Abu Dhabi · Pitch 4')).toBeInTheDocument()
  })

  it('leaves a venue-only fixture row exactly as it was', () => {
    render(<FixtureRow event={{ ...EXISTING_TRAINING, pitch: null }} teamName="U12" onSelect={vi.fn()} />)

    expect(screen.getByText('Zayed Sports City, Abu Dhabi')).toBeInTheDocument()
  })
})
