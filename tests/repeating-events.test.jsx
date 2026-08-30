import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from './helpers/pickDate.js'

// Tests for the "Repeats" section of src/screens/EventForm.jsx — bulk-creating
// a term of training from one form submission. The pure date generator has its
// own file (tests/recurrence.test.js); this file is about the form: what it
// shows, what it writes, and what it refuses to show when editing.
//
// PROCESS ZONE. America/New_York, same as tests/event-form.test.jsx. A series
// created from a browser outside UTC+4 has to land on the CLUB's weekdays at
// the CLUB's wall-clock time; under a UTC runner a zone bug is invisible.
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

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAMS = [TEAM_U12]
const COACH_U12 = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u12' }]

const EXISTING_TRAINING = {
  id: 'e-1',
  club_id: CLUB_ID,
  team_id: 't-u12',
  type: 'training',
  title: 'U12 Contact',
  opponent: null,
  home: null,
  venue: 'Zayed Sports City, Abu Dhabi',
  competition: null,
  starts_at: '2026-08-11T14:00:00.000Z',
  result_us: null,
  result_them: null,
}

function renderForm({ event = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: COACH_U12,
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(<EventForm event={event} onClose={onClose} onSaved={onSaved} />)
  return { onSaved, onClose, user: userEvent.setup() }
}

// Fills in a valid training event and sets up a Tue+Thu repeat running from
// Tue 11 Aug 2026 to Thu 20 Aug 2026 — four sessions, 18:00 Abu Dhabi time.
async function fillTuesdayThursdaySeries(user) {
  await user.click(screen.getByRole('radio', { name: 'Training' }))
  await user.type(screen.getByLabelText('Title'), 'U12 Contact')

  await pickDate(user, '2026-08-11')
  await user.type(screen.getByLabelText('Time'), '18:00')
  await user.type(screen.getByLabelText('End time'), '19:30')

  await user.click(screen.getByRole('checkbox', { name: 'Tue' }))
  await user.click(screen.getByRole('checkbox', { name: 'Thu' }))
  // The end date is now set through the app's own inline calendar (the native
  // date picker was retired 29 Aug 2026). Start is 11 Aug, so the calendar opens
  // on August — the day buttons carry the ISO date as their accessible name.
  await user.click(screen.getByRole('button', { name: /or pick an end date/i }))
  await user.click(screen.getByRole('button', { name: '2026-08-20' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertEventMock.mockResolvedValue({ id: 'saved' })
  insertEventsMock.mockImplementation(async (rows) => rows.map((row, i) => ({ ...row, id: `e${i}` })))
})

describe('Repeats section', () => {
  it('is offered when adding an event', () => {
    renderForm()
    expect(screen.getByRole('group', { name: 'Repeats' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tue' })).toBeInTheDocument()
    // Defaults to a week count; the exact-date calendar is behind a link.
    expect(screen.getByLabelText('Repeat weekly for')).toBeInTheDocument()
  })

  it('is NOT offered when editing an existing event', () => {
    // Each occurrence is independent after creation. Offering "repeats" on an
    // edit would imply this one edit reshapes the others, which it cannot.
    renderForm({ event: EXISTING_TRAINING })
    expect(screen.queryByRole('group', { name: 'Repeats' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Tue' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Repeat weekly for')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('previews the generated dates and counts them', async () => {
    const { user } = renderForm()
    await fillTuesdayThursdaySeries(user)

    expect(screen.getByText('4 sessions')).toBeInTheDocument()
    for (const label of ['Tue 11 Aug', 'Thu 13 Aug', 'Tue 18 Aug', 'Thu 20 Aug']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked()
    }
    // The button names the number too — the last chance to notice a mistyped
    // end date before anything is written.
    expect(screen.getByRole('button', { name: 'Add 4 events' })).toBeInTheDocument()
  })
})

describe('saving a series', () => {
  it('writes one batch, every row sharing one series_id', async () => {
    const { user } = renderForm()
    await fillTuesdayThursdaySeries(user)
    await user.click(screen.getByRole('button', { name: 'Add 4 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalledTimes(1))
    // ONE call, not four — a partial failure must not leave half a term
    // created, and upsertEvent must not have been used at all.
    expect(upsertEventMock).not.toHaveBeenCalled()

    const rows = insertEventsMock.mock.calls[0][0]
    expect(rows).toHaveLength(4)

    const ids = new Set(rows.map((row) => row.series_id))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('lands on the club’s weekdays and wall-clock from a browser outside UTC+4', async () => {
    // This whole file runs under America/New_York. 18:00 in Abu Dhabi is
    // 14:00Z, and 10:00 the same morning in New York — so a Date-based
    // implementation would put these on the wrong instants, and a series
    // near midnight on the wrong DAY.
    const { user } = renderForm()
    await fillTuesdayThursdaySeries(user)
    await user.click(screen.getByRole('button', { name: 'Add 4 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalledTimes(1))
    const rows = insertEventsMock.mock.calls[0][0]

    expect(rows.map((row) => row.starts_at)).toEqual([
      '2026-08-11T14:00:00.000Z',
      '2026-08-13T14:00:00.000Z',
      '2026-08-18T14:00:00.000Z',
      '2026-08-20T14:00:00.000Z',
    ])
    // And every row is otherwise the event the coach filled in.
    for (const row of rows) {
      expect(row).toMatchObject({ team_id: 't-u12', club_id: CLUB_ID, type: 'training', title: 'U12 Contact' })
      expect(row.id).toBeUndefined()
    }
  })

  it('gives every occurrence its OWN ends_at, at the same club wall-clock', async () => {
    // ⚠️ THE TRAP THIS TEST EXISTS FOR. ends_at has to be converted against
    // EACH occurrence's date, exactly as starts_at is. Computing one end
    // instant and reusing it across the series would give the first session
    // a 90-minute finish and every later one an end BEFORE its own start —
    // which the events_ends_after_starts CHECK rejects as a raw 23514, and
    // because insertEvents sends the term as one statement, the whole term
    // fails on the strength of the second row.
    const { user } = renderForm()
    await fillTuesdayThursdaySeries(user)
    await user.click(screen.getByRole('button', { name: 'Add 4 events' }))

    await waitFor(() => expect(insertEventsMock).toHaveBeenCalledTimes(1))
    const rows = insertEventsMock.mock.calls[0][0]

    // 18:00–19:30 Abu Dhabi on each of the four dates. This file runs under
    // America/New_York.
    expect(rows.map((row) => row.ends_at)).toEqual([
      '2026-08-11T15:30:00.000Z',
      '2026-08-13T15:30:00.000Z',
      '2026-08-18T15:30:00.000Z',
      '2026-08-20T15:30:00.000Z',
    ])
    // Four distinct ends — not one repeated, which is the failure mode.
    expect(new Set(rows.map((row) => row.ends_at)).size).toBe(4)
    // And each end is after its own start, by the same 90 minutes.
    rows.forEach((row) => {
      expect(Date.parse(row.ends_at) - Date.parse(row.starts_at)).toBe(90 * 60 * 1000)
    })
  })
})

describe('unticking a date', () => {
  it('excludes exactly that one and nothing else', async () => {
    const { user } = renderForm()
    await fillTuesdayThursdaySeries(user)

    await user.click(screen.getByRole('checkbox', { name: 'Thu 13 Aug' }))

    // The count and the button follow what is ticked, not what was generated.
    expect(screen.getByText('3 sessions')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Thu 13 Aug' })).not.toBeChecked()
    // The row stays visible so it can be ticked back on.
    expect(screen.getByRole('checkbox', { name: 'Tue 11 Aug' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tue 18 Aug' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Thu 20 Aug' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Add 3 events' }))
    await waitFor(() => expect(insertEventsMock).toHaveBeenCalledTimes(1))

    expect(insertEventsMock.mock.calls[0][0].map((row) => row.starts_at)).toEqual([
      '2026-08-11T14:00:00.000Z',
      '2026-08-18T14:00:00.000Z',
      '2026-08-20T14:00:00.000Z',
    ])
  })

  it('can be ticked back on', async () => {
    const { user } = renderForm()
    await fillTuesdayThursdaySeries(user)

    const thu13 = () => screen.getByRole('checkbox', { name: 'Thu 13 Aug' })
    await user.click(thu13())
    await user.click(thu13())

    expect(screen.getByText('4 sessions')).toBeInTheDocument()
    expect(thu13()).toBeChecked()
  })
})

describe('one-off events are untouched', () => {
  it('still writes a single event through upsertEvent when nothing repeats', async () => {
    const { user } = renderForm()
    await user.click(screen.getByRole('radio', { name: 'Training' }))
    await user.type(screen.getByLabelText('Title'), 'U12 Contact')
    await pickDate(user, '2026-08-11')
    await user.type(screen.getByLabelText('Time'), '18:00')
  await user.type(screen.getByLabelText('End time'), '19:30')

    await user.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(insertEventsMock).not.toHaveBeenCalled()
    // No series_id on a one-off — the column stays null, which is what
    // "not part of a series" means.
    expect(upsertEventMock.mock.calls[0][0].series_id).toBeUndefined()
  })

  it('does not repeat when only the weekdays are ticked and no end date is given', async () => {
    const { user } = renderForm()
    await user.click(screen.getByRole('radio', { name: 'Training' }))
    await user.type(screen.getByLabelText('Title'), 'U12 Contact')
    await pickDate(user, '2026-08-11')
    await user.type(screen.getByLabelText('Time'), '18:00')
  await user.type(screen.getByLabelText('End time'), '19:30')
    await user.click(screen.getByRole('checkbox', { name: 'Tue' }))

    await user.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(insertEventsMock).not.toHaveBeenCalled()
  })
})
