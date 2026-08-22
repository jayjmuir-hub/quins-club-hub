import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('opens the event form for squad staff, then clears the param', async () => {
    renderAt('/schedule?open=add-event')
    expect(await screen.findByTestId('event-form-stub')).toBeInTheDocument()
    expect(screen.getByTestId('search-probe').textContent).toBe('')
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
