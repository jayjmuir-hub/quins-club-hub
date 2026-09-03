import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Club Diary phase 2, task 5 — the three-way time control.
// claude/plans/2026-09-01-club-diary-phase-2-implementation.md.
//
// ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC.
//
// ⚠️ PROCESS ZONE: America/New_York, same as tests/event-form.test.jsx and for
// a sharper reason here. THE OFF-BY-ONE-DAY TRAP: an all-day event must store
// CLUB-midnight (20:00 UTC the previous day). A form that stores UTC midnight
// — what new Date('2026-09-17') gives you — renders as 16 Sep in Dubai, a day
// early, in the push AND the feed AND the schedule. Under a UTC runner that
// bug is INVISIBLE, because UTC midnight and the assertion's expectation
// coincide. Under New York they cannot.
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
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  insertEvents: async () => [],
  updateSeriesFrom: async () => {},
  setSeriesTimeFrom: async () => {},
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

import EventForm from '../src/screens/EventForm.jsx'
import { pickDate } from './helpers/pickDate.js'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }
const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

function renderForm({ memberships = ADMIN, teams = [TEAM_U16], ...rest } = {}) {
  useMembershipsMock.mockReturnValue({ memberships, teams, loading: false, error: null })
  render(<EventForm onClose={() => {}} onSaved={() => {}} {...rest} />)
}

beforeEach(() => {
  useMembershipsMock.mockReset()
  upsertEventMock.mockReset()
  upsertEventMock.mockResolvedValue({ id: 'e-saved' })
})

describe('the three-way time control', () => {
  it('offers Timed, Time TBD and All day', () => {
    renderForm({ initialKind: 'social' })
    expect(screen.getByRole('radio', { name: 'Timed' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Time TBD' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All day' })).toBeInTheDocument()
  })

  it('⚠️ an all-day save stores CLUB-midnight, not UTC midnight', async () => {
    // 2026-09-17 club-midnight is 2026-09-16T20:00:00Z. A UTC-midnight bug
    // stores ...17T00:00:00Z and this file's New York zone makes the two
    // diverge loudly. Asserting the INSTANT is asserting the rendered date:
    // every renderer derives the day via CLUB_TIME_ZONE.
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Title'), 'Kit collection')
    await pickDate(user, '2026-09-17')
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.all_day).toBe(true)
    expect(payload.time_tbd).toBe(false)
    expect(new Date(payload.starts_at).toISOString()).toBe('2026-09-16T20:00:00.000Z')
  })

  it('⚠️ a ONE-day all-day event stores ends_at null — no stale span', async () => {
    // The database refuses ends_at = starts_at (events_ends_after_starts), so
    // anything non-null here would either be stale or wrong.
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Title'), 'Shop opening')
    await pickDate(user, '2026-09-17')
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0].ends_at).toBe(null)
  })

  it('a multi-day span stores club-midnight on the LAST day', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Title'), 'Kit collection')
    await pickDate(user, '2026-09-17')
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    await pickDate(user, '2026-09-18', /until/i)
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const payload = upsertEventMock.mock.calls[0][0]
    expect(new Date(payload.starts_at).toISOString()).toBe('2026-09-16T20:00:00.000Z')
    expect(new Date(payload.ends_at).toISOString()).toBe('2026-09-17T20:00:00.000Z')
  })

  it('hides the time fields in the all-day state', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'social' })

    expect(screen.getByLabelText('Time')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('End time')).not.toBeInTheDocument()
  })

  it('⚠️ switching all-day back to Timed drops the until-date — no stale ends_at', async () => {
    // The Validator's second trap, from the editing side: an ends_at written in
    // the all-day state must not survive into the timed state, where it would
    // combine with a typed end time or linger as a five-week "span".
    const user = userEvent.setup()
    renderForm({ initialKind: 'social' })

    await user.type(screen.getByLabelText('Title'), 'Quiz night')
    await pickDate(user, '2026-09-17')
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    await pickDate(user, '2026-10-22', /until/i)
    await user.click(screen.getByRole('radio', { name: 'Timed' }))
    await user.type(screen.getByLabelText('Time'), '19:00')
    await user.type(screen.getByLabelText('End time'), '21:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.all_day).toBe(false)
    // 19:00–21:00 club time on the 17th, not October anything.
    expect(new Date(payload.ends_at).toISOString()).toBe('2026-09-17T17:00:00.000Z')
  })

  it('the timed path is byte-identical to before — the regression guard', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'social' })

    await user.type(screen.getByLabelText('Title'), 'Quiz night')
    await pickDate(user, '2026-07-30')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.all_day).toBe(false)
    expect(payload.time_tbd).toBe(false)
    expect(new Date(payload.starts_at).toISOString()).toBe('2026-07-30T16:00:00.000Z')
    expect(new Date(payload.ends_at).toISOString()).toBe('2026-07-30T18:00:00.000Z')
  })

  it('an existing all-day event opens in the all-day state', () => {
    renderForm({
      event: {
        id: 'e-kit', club_id: CLUB_ID, team_id: 't-u16', type: 'social',
        title: 'Kit collection', info_only: true, all_day: true, time_tbd: false,
        starts_at: '2026-09-16T20:00:00Z', ends_at: null,
        availability_override: 'auto',
      },
    })
    expect(screen.getByRole('radio', { name: 'All day' })).toBeChecked()
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument()
  })
})

describe('the until-date round trip', () => {
  // ⚠️ ADDED AFTER A FAULT INJECTION PASSED. Removing the untilDate-clearing
  // line changed nothing for the direct switch — the save path branches on
  // allDay, so a stale value in state never reaches a Timed payload. The
  // reachable staleness is the ROUND TRIP: All day → until set → Timed → back
  // to All day → save. With clearing, that is a one-day event; without it, the
  // October date silently resurrects as a five-week span.
  it('⚠️ leaving All day forgets the until-date', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Title'), 'Kit collection')
    await pickDate(user, '2026-09-17')
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    await pickDate(user, '2026-10-22', /until/i)
    await user.click(screen.getByRole('radio', { name: 'Timed' }))
    await user.click(screen.getByRole('radio', { name: 'All day' }))
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0].ends_at).toBe(null)
  })
})
