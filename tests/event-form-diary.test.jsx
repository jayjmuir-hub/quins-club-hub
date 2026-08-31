import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Club Diary phase 1, tasks 5 and 6 — claude/plans/2026-08-31-club-diary.md.
//
// A Club Diary entry is a dated item with nothing to RSVP to: a kit collection,
// a shop opening, a ball collection. It is stored as `type = 'social'` with
// `info_only = true`, NOT as a fourth events.type — `type` is read by a dozen
// three-way branches that would fall through a new value silently.
//
// ⚠️ EVERY NAME AND EVENT BELOW IS INVENTED. This repo is PUBLIC and its
// members are mostly children.
//
// Mocking mirrors tests/event-form.test.jsx deliberately rather than inventing
// a second harness. listAvailability is a real mock here (it is `async () => []`
// there) because task 6's refusal depends on what it returns.

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const listAvailabilityMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  // EventForm imports these three; omitting them leaves undefined bindings that
  // only fail on the paths that use them, which is a confusing red.
  insertEvents: async () => [],
  updateSeriesFrom: async () => {},
  setSeriesTimeFrom: async () => {},
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: () => () => {},
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }
const TEAMS = [TEAM_U16]
const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null }]

function membershipValue(memberships, teams) {
  return { memberships, teams, loading: false, error: null }
}

function renderForm({ memberships = ADMIN, teams = TEAMS, ...rest } = {}) {
  useMembershipsMock.mockReturnValue(membershipValue(memberships, teams))
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<EventForm onClose={onClose} onSaved={onSaved} {...rest} />)
  return { onClose, onSaved }
}

const EXISTING_SOCIAL = {
  id: 'e-social',
  club_id: CLUB_ID,
  team_id: 't-u16',
  type: 'social',
  title: 'Welcome back party',
  info_only: false,
  starts_at: '2026-09-11T15:00:00Z',
  // ⚠️ ends_at IS LOAD-BEARING IN THIS FIXTURE, not decoration. The form flags
  // an empty End time as invalid for every non-match kind (measured: social,
  // training and diary behave identically), so a fixture without one never
  // reaches the save path being tested.
  ends_at: '2026-09-11T17:00:00Z',
  time_tbd: false,
  availability_override: 'auto',
}

beforeEach(() => {
  useMembershipsMock.mockReset()
  upsertEventMock.mockReset()
  listAvailabilityMock.mockReset()
  upsertEventMock.mockResolvedValue({ id: 'e-saved' })
  listAvailabilityMock.mockResolvedValue([])
})

describe('EventForm opened as a Club Diary', () => {
  it('saves type=social with info_only true', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Title'), 'Kit collection')
    await user.type(screen.getByLabelText('Time'), '17:00')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const payload = upsertEventMock.mock.calls[0][0]
    expect(payload.type).toBe('social')
    expect(payload.info_only).toBe(true)
  })

  it('⚠️ never writes "diary" into events.type', async () => {
    // 'diary' is a UI kind. If it ever reaches the column, every three-way
    // branch on type in this app falls through SILENTLY — no error, just a
    // missing icon, a missing filter row and a mislabelled calendar entry.
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Title'), 'Ball collection')
    await user.type(screen.getByLabelText('Time'), '09:00')
    await user.type(screen.getByLabelText('End time'), '11:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0].type).not.toBe('diary')
  })

  it('hides the match-only fields and the availability control', () => {
    renderForm({ initialKind: 'diary' })

    expect(screen.queryByLabelText('Opponent')).not.toBeInTheDocument()
    expect(screen.queryByText('Self-service availability')).not.toBeInTheDocument()
  })

  it('still shows the availability control for an ordinary social', () => {
    // The CONTROL. Without it, the assertion above would pass just as well if
    // the availability block had been deleted for every event type.
    renderForm({ initialKind: 'social' })

    expect(screen.getByText('Self-service availability')).toBeInTheDocument()
  })

  it('still requires a title, like any non-match', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'diary' })

    await user.type(screen.getByLabelText('Time'), '17:00')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
  })
})

describe('EventForm reclassifying a social as a Club Diary', () => {
  it('⚠️ REFUSES when replies already exist', async () => {
    // Orphaning the availability rows hides data that still exists; deleting
    // them destroys a coach's answer. Refusing is the only outcome that cannot
    // lose information.
    const user = userEvent.setup()
    listAvailabilityMock.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }])
    renderForm({ event: EXISTING_SOCIAL })

    await user.click(screen.getByLabelText(/nothing to reply to/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/3 people have already replied/i)
    expect(upsertEventMock).not.toHaveBeenCalled()
  })

  it('says "1 person has" rather than "1 people have"', async () => {
    const user = userEvent.setup()
    listAvailabilityMock.mockResolvedValue([{ id: 'a1' }])
    renderForm({ event: EXISTING_SOCIAL })

    await user.click(screen.getByLabelText(/nothing to reply to/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/1 person has already replied/i)
  })

  it('ALLOWS the toggle when nobody has replied', async () => {
    // The control for the refusal: proves the guard is reading the replies and
    // not simply blocking the toggle outright.
    const user = userEvent.setup()
    listAvailabilityMock.mockResolvedValue([])
    renderForm({ event: EXISTING_SOCIAL })

    await user.click(screen.getByLabelText(/nothing to reply to/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0].info_only).toBe(true)
  })

  it('does not consult availability at all when the flag is not being turned on', async () => {
    // Editing an ordinary social must not pay for a query it does not need,
    // and must never be refused for having replies — which is the normal case.
    const user = userEvent.setup()
    renderForm({ event: EXISTING_SOCIAL })

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Welcome back party 2')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(listAvailabilityMock).not.toHaveBeenCalled()
  })
})
