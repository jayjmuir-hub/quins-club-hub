import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useLocation } from 'react-router-dom'

// The sidebar's Schedule deep-links: /schedule?open=subscribe opens the
// Add-to-calendar sheet, /schedule?open=add-event opens the event form for
// squad staff — and BOTH clear the param once consumed, so a refresh does
// not reopen a sheet the person closed. tests/schedule.test.jsx owns the
// screen's ordinary behaviour; this file only proves the ?open= contract.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const myCalendarTokenMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: vi.fn().mockResolvedValue([]),
  subscribeAvailability: vi.fn(() => () => {}),
  setAvailability: vi.fn(),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: vi.fn().mockResolvedValue([]),
}))
vi.mock('../src/data/calendar.js', () => ({
  myCalendarToken: (...args) => myCalendarTokenMock(...args),
  resetMyCalendarToken: vi.fn(),
  calendarFeedUrl: (token) => `https://example.test/calendar.ics?token=${token}`,
  calendarWebcalUrl: (token) => `webcal://example.test/calendar.ics?token=${token}`,
}))
const getSessionMock = vi.fn()
vi.mock('../src/data/trainingPlans.js', () => ({
  getSuggestion: async () => null,
  listPendingSuggestions: async () => [],
  decideSuggestion: async () => null,
  getSession: (...args) => getSessionMock(...args),
  saveSessionBlocks: async () => {},
  listFocus: async () => [],
  listDrills: async () => [],
  listTemplates: async () => [],
  createSession: async () => ({ id: 's-new' }),
  setSessionVisibility: async () => ({}),
  saveSquadTemplate: async () => ({ id: 'tpl-new' }),
  upsertDrill: async () => ({ id: 'd-new' }),
  submitDrillToClub: async () => ({}),
  submitTemplateToClub: async () => ({}),
}))
vi.mock('../src/components/PitchRequest.jsx', () => ({ default: () => null }))
// The form itself is EventForm's own suite's problem; here only "did the
// deep-link open it" matters.
vi.mock('../src/screens/EventForm.jsx', () => ({
  default: () => <div data-testid="event-form-stub">event form</div>,
}))

import Schedule from '../src/screens/Schedule.jsx'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="search-probe">{location.search}</span>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Schedule />
      <LocationProbe />
    </MemoryRouter>,
  )
}

const TEAMS = [{ id: 't-u12', name: 'U12 Mixed', sort_order: 3 }]
const COACH = [{ role: 'coach', team_id: 't-u12', status: 'active' }]
const PARENT = [{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }]

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: TEAMS, loading: false })
  listEventsMock.mockResolvedValue([])
  subscribeEventsMock.mockReturnValue(() => {})
  myCalendarTokenMock.mockResolvedValue('tok-123')
  getSessionMock.mockResolvedValue(null)
})

describe('?open=subscribe', () => {
  it('opens the Add-to-calendar sheet with the minted link, then clears the param', async () => {
    renderAt('/schedule?open=subscribe')
    expect(await screen.findByText('Add to your calendar')).toBeInTheDocument()
    expect(await screen.findByTestId('calendar-url')).toHaveTextContent('tok-123')
    expect(screen.getByTestId('search-probe').textContent).toBe('')
  })
})

describe('?open=add-event', () => {
  it('opens the add-event flow for squad staff, then clears the param', async () => {
    const user = userEvent.setup()
    renderAt('/schedule?open=add-event')
    // The deeplink now opens the "What are you adding?" chooser first; picking a
    // kind reaches the form. The param is cleared as soon as the flow opens.
    const chooser = await screen.findByRole('dialog')
    expect(within(chooser).getByText('What are you adding?')).toBeInTheDocument()
    expect(screen.getByTestId('search-probe').textContent).toBe('')
    await user.click(within(chooser).getByRole('button', { name: /^match/i }))
    expect(await screen.findByTestId('event-form-stub')).toBeInTheDocument()
  })

  it('for a parent it opens nothing and still clears the param', async () => {
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: TEAMS, loading: false })
    renderAt('/schedule?open=add-event')
    // The param clearing is the observable that the deep-link was consumed.
    await vi.waitFor(() => {
      expect(screen.getByTestId('search-probe').textContent).toBe('')
    })
    expect(screen.queryByTestId('event-form-stub')).not.toBeInTheDocument()
  })
})

// The chat's fixture card links here (squad chat phase 2, 23 Aug 2026).
describe('?event=<id>', () => {
  it('opens that fixture\u2019s detail sheet, then clears the param', async () => {
    listEventsMock.mockResolvedValue([
      { id: 'ev-9', team_id: 't-u12', type: 'match', opponent: 'ZZ Probe Eagles', home: true,
        starts_at: '2099-08-29T05:30:00Z', ends_at: null, time_tbd: false, series_id: null },
    ])
    renderAt('/schedule?event=ev-9')
    expect(await screen.findByRole('dialog')).toHaveTextContent(/ZZ Probe Eagles/)
    await vi.waitFor(() => {
      expect(screen.getByTestId('search-probe').textContent).toBe('')
    })
  })

  it('a training ?event= opens that hour with the plan visible', async () => {
    listEventsMock.mockResolvedValue([
      {
        id: 'e-train-1',
        team_id: 't-u12',
        type: 'training',
        title: 'Tuesday training',
        opponent: null,
        home: true,
        starts_at: '2099-08-29T15:00:00Z',
        ends_at: null,
        time_tbd: false,
        series_id: null,
      },
    ])
    getSessionMock.mockResolvedValue({
      id: 's-1',
      event_id: 'e-train-1',
      visibility: 'squad',
      notes: 'Wet pitch, keep it tight.',
      blocks: [
        {
          id: 'b-1',
          position: 1,
          drill_id: 'd-grid',
          minutes: 15,
          coach_note: 'Keep the width',
          drill: { id: 'd-grid', title: 'Grid passing', minutes: 15, category: 'skill' },
        },
      ],
    })
    renderAt('/schedule?event=e-train-1')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Tuesday training')
    expect(await screen.findByRole('heading', { name: /session plan/i })).toBeInTheDocument()
    expect(screen.getByText('Grid passing')).toBeInTheDocument()
    expect(screen.getByTestId('session-total')).toHaveTextContent('15 min')
    expect(screen.getByRole('button', { name: /^share$/i })).toBeInTheDocument()
  })

  it('a parent following the link still cannot see a staff-only plan', async () => {
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: TEAMS, loading: false })
    listEventsMock.mockResolvedValue([
      {
        id: 'e-staff-1',
        team_id: 't-u12',
        type: 'training',
        title: 'Tuesday training',
        opponent: null,
        home: true,
        starts_at: '2099-08-29T15:00:00Z',
        ends_at: null,
        time_tbd: false,
        series_id: null,
      },
    ])
    // RLS: a staff-only row is filtered out of the parent's read.
    getSessionMock.mockResolvedValue(null)
    renderAt('/schedule?event=e-staff-1')
    expect(await screen.findByRole('dialog')).toHaveTextContent('Tuesday training')
    await vi.waitFor(() => expect(getSessionMock).toHaveBeenCalledWith('e-staff-1'))
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Grid passing')).not.toBeInTheDocument()
  })
})
