import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The dashboard's route into the RSVP sheet.
//
// ⚠️ A SEPARATE FILE BECAUSE OF THE FLAG. `FEATURES.availability` is FALSE in
// src/lib/features.js — switched off on 2026-07-29 because the club was not
// ready to rely on digital RSVP — so EventDetail renders no availability
// section at all and none of this is reachable in the running app today.
// tests/dashboard.test.jsx deliberately runs with the real flag, i.e. off; this
// file mocks it ON, which is why it cannot live in that file.
//
// ⚠️ WHAT IT GUARDS, AND WHY IT IS WORTH TESTING A SWITCHED-OFF FEATURE.
// EventDetail drew "Set my availability" from BOTH Schedule and the Dashboard,
// but only Schedule ever passed `onOpenAvailability` — and the call site was
// `onOpenAvailability?.(event)`, so on the home screen the button rendered,
// invited a tap, and the optional call swallowed it. A drawn, tappable, dead
// button. Nothing failed, because every availability test drove Schedule.
//
// The flag is what stopped anybody meeting it. Flip it back on without this
// fix and the most common path in the app — parent opens the app, taps the next
// fixture, taps availability — does nothing at all.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()

// Home's first-load gate waits for the notices read since 2 Sep 2026 (UX
// review, pattern 6); unmocked, the real module never settles in jsdom and
// the skeleton would stay up forever.
vi.mock('../src/data/announcements.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listNotices: async () => [],
  listMyReads: async () => new Set(),
}))

vi.mock('../src/lib/features.js', () => ({ FEATURES: { availability: true } }))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jay@example.com' } }),
}))

vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  getMyProfile: vi.fn().mockResolvedValue({ id: 'profile-1', first_name: 'Jay', last_name: 'Muir' }),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: () => () => {},
  upsertEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

vi.mock('../src/data/playups.js', () => ({
  listMyPendingPlayups: async () => [],
  answerJuniorPlayup: async () => {},
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  listAvailabilityForEvents: async () => [],
  subscribeAvailability: () => () => {},
  setAvailability: async () => ({}),
}))

import Dashboard from '../src/screens/Dashboard.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const NOW = Date.parse('2026-07-20T05:00:00Z')

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const COACH = [
  { id: 'm1', role: 'coach', team_id: 'team-u10' },
  { id: 'm2', role: 'coach', team_id: 'team-1xv' },
]

const TRAINING = {
  id: 'e-training',
  team_id: 'team-u10',
  type: 'training',
  title: 'U10 skills session',
  starts_at: '2026-07-21T15:30:00Z',
  venue: 'Zayed Sports City',
  result_us: null,
  result_them: null,
}
const MATCH = {
  id: 'e-match',
  team_id: 'team-1xv',
  type: 'match',
  opponent: 'Al Ain Amblers',
  starts_at: '2026-07-24T13:00:00Z',
  venue: 'Zayed Sports City',
  home: true,
  result_us: null,
  result_them: null,
}

beforeEach(() => {
  clearMyProfileCache()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  useMembershipsMock.mockReturnValue({
    memberships: COACH,
    teams: [TEAM_FIRST_XV, TEAM_U10],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  listEventsMock.mockResolvedValue([TRAINING, MATCH])
  listPlayersMock.mockResolvedValue([
    { id: 'p1', team_id: 'team-u10', full_name: 'Amir Haddad', position: 'Prop' },
  ])
})

function renderDashboard() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Dashboard />
    </MemoryRouter>,
  )
}

/** Opens a fixture's detail sheet from the Upcoming list. */
async function openFixture(text = /U10 skills session/) {
  const list = await screen.findByTestId('upcoming-list')
  // A matcher, not an exact string: the opponent renders inside "vs Al Ain
  // Amblers", so an exact-text query finds nothing.
  const row = within(list).getByText(text).closest('[data-testid="fixture-row"]')
  await userEvent.click(row)
  return screen.findByRole('dialog')
}

describe('availability from the home screen', () => {
  it('FAULT: the button opens the RSVP sheet instead of doing nothing', async () => {
    renderDashboard()
    const dialog = await openFixture()

    await userEvent.click(within(dialog).getByRole('button', { name: /availability/i }))

    // Asserting a player row from the RSVP sheet, not the button — a dead
    // button leaves the detail sheet on screen, and anything still satisfied by
    // that would not have caught the defect this file exists for.
    expect(await screen.findByText('Amir Haddad')).toBeInTheDocument()
  })

  it('⚠️ does not carry the open RSVP sheet over to the NEXT fixture tapped', async () => {
    // `availabilityOpen` is screen-level state, not per-event. Left true, the
    // next fixture skips its own detail sheet and opens straight into that
    // event's availability — two pieces of state disagreeing, with the screen
    // obeying the stale one.
    renderDashboard()
    const dialog = await openFixture()
    await userEvent.click(within(dialog).getByRole('button', { name: /availability/i }))
    await screen.findByText('Amir Haddad')

    // Back out of both sheets, then open a different fixture.
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{Escape}')
    await openFixture(/Al Ain Amblers/)

    // The new fixture's DETAIL sheet. The U10 player list belongs to the other
    // event's RSVP sheet and must not be on screen.
    expect(screen.queryByText('Amir Haddad')).not.toBeInTheDocument()
  })
})
