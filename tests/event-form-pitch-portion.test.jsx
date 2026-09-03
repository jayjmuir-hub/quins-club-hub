import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from './helpers/pickDate.js'

// The pitch-portion picker on EventForm (phase 2 of pitch sharing). Different
// age groups share a pitch — a quarter or a half each — so the form pre-fills
// how much of the pitch a booking uses from the squad's age, and writes it as
// events.pitch_portion. The capacity clash detector (tests/pitch-clashes.test.js)
// then treats a share that fits as no clash at all.
//
// Network-free: useMemberships, the event writer, availability and the pitch
// list are all mocked. A managed pitch is provided so the picker can be driven
// by selecting a real pitch rather than the free-text escape hatch.

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  deleteEvent: async () => undefined,
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

vi.mock('../src/data/pitches.js', () => ({
  PITCH_TBD: 'Pitch TBD',
  listPitches: async () => [{ id: 'p1', name: 'Pitch 1' }],
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U8 = { id: 't-u8', club_id: CLUB_ID, name: 'U8 Tag', sort_order: 2 }
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAMS = [TEAM_U8, TEAM_U12]

const membershipValue = (memberships, teams = TEAMS) => ({
  memberships,
  teams,
  loading: false,
  error: null,
  reload: vi.fn(),
})

function renderForm({ memberships, teams = TEAMS, event = null, ...rest } = {}) {
  useMembershipsMock.mockReturnValue(membershipValue(memberships, teams))
  return render(<EventForm event={event} onClose={vi.fn()} onSaved={vi.fn()} {...rest} />)
}

const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

const portionField = () => screen.queryByLabelText('How much of the pitch')

beforeEach(() => {
  useMembershipsMock.mockReset()
  upsertEventMock.mockReset()
  upsertEventMock.mockResolvedValue({ id: 'e-saved' })
})

describe('EventForm pitch portion', () => {
  it('stays hidden until a real pitch is chosen', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN, initialKind: 'training' })

    // Default is "No pitch": nothing to split, so no portion field.
    expect(portionField()).not.toBeInTheDocument()

    // Pitch TBD is a placeholder, not a pitch — still nothing to split.
    await user.selectOptions(screen.getByLabelText('Pitch'), 'Pitch TBD')
    expect(portionField()).not.toBeInTheDocument()

    // A real pitch reveals the picker.
    await screen.findByRole('option', { name: 'Pitch 1' })
    await user.selectOptions(screen.getByLabelText('Pitch'), 'Pitch 1')
    expect(portionField()).toBeInTheDocument()
  })

  it('pre-fills a quarter for a U8 training session', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN, initialKind: 'training' })

    // The squad dropdown defaults to the first team (U8 Tag).
    await screen.findByRole('option', { name: 'Pitch 1' })
    await user.selectOptions(screen.getByLabelText('Pitch'), 'Pitch 1')
    expect(portionField()).toHaveValue('quarter')
  })

  it('pre-fills a full pitch for a U12 match', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN, initialKind: 'match', teams: [TEAM_U12] })

    await screen.findByRole('option', { name: 'Pitch 1' })
    await user.selectOptions(screen.getByLabelText('Pitch'), 'Pitch 1')
    expect(portionField()).toHaveValue('full')
  })

  it('writes the chosen portion, and null when there is no pitch', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN, initialKind: 'training', teams: [TEAM_U12] })

    // No pitch chosen → portion is null on the payload.
    await pickDate(user, '2026-07-30')
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.type(screen.getByLabelText('Title'), 'Skills night')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0].pitch_portion).toBe(null)
  })

  it('writes the portion chosen against a real pitch', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN, initialKind: 'training', teams: [TEAM_U12] })

    await screen.findByRole('option', { name: 'Pitch 1' })
    await user.selectOptions(screen.getByLabelText('Pitch'), 'Pitch 1')
    // U12 training defaults to a half; override it to a quarter.
    await user.selectOptions(portionField(), 'quarter')
    await pickDate(user, '2026-07-30')
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.type(screen.getByLabelText('Title'), 'Skills night')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    expect(written.pitch).toBe('Pitch 1')
    expect(written.pitch_portion).toBe('quarter')
  })

  it('opens an existing booking on its stored portion without overwriting it', async () => {
    // A U12 booking stored as a half must NOT be silently bumped to the U12
    // default (full) just because the default effect runs on open.
    renderForm({
      memberships: ADMIN,
      teams: [TEAM_U12],
      event: {
        id: 'e1',
        type: 'training',
        team_id: 't-u12',
        title: 'Session',
        starts_at: '2026-07-30T14:00:00.000Z',
        ends_at: '2026-07-30T15:00:00.000Z',
        pitch: 'Pitch 1',
        pitch_portion: 'half',
      },
    })
    expect(portionField()).toHaveValue('half')
  })
})
