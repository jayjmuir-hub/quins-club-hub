import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// /squad/:teamId/match-roster — Build a Match Roster, the PICKER. The builder
// is the existing Lineup screen; every row here must land on /lineup/:eventId.
//
// ⚠️ WHAT MATTERS HERE:
//   - the gate is "not your squad", same as the hub;
//   - only UPCOMING MATCHES list — past matches and training never do;
//   - the RSVP tally and the "Lineup started" badge discriminate per fixture;
//   - a lineup-count failure degrades to "no badge", never to a dead page.

const listEventsMock = vi.fn()
const listAvailabilityForEventsMock = vi.fn()
const listLineupCountsMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailabilityForEvents: (...args) => listAvailabilityForEventsMock(...args),
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineupCounts: (...args) => listLineupCountsMock(...args),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

import MatchRosterPicker from '../src/screens/MatchRosterPicker.jsx'

const TEAMS = [{ id: 't-u12', name: 'U12 Mixed', sort_order: 3 }]

// Invented opponents — this repo is public.
const FUTURE_MATCH_A = {
  id: 'e-m1',
  team_id: 't-u12',
  type: 'match',
  opponent: 'Dubai Falcons',
  starts_at: '2099-01-09T08:00:00Z',
}
const FUTURE_MATCH_B = {
  id: 'e-m2',
  team_id: 't-u12',
  type: 'match',
  opponent: 'Al Ain Amblers',
  starts_at: '2099-01-16T08:00:00Z',
}
const PAST_MATCH = {
  id: 'e-past',
  team_id: 't-u12',
  type: 'match',
  opponent: 'Sharjah',
  starts_at: '2026-08-01T08:00:00Z',
}
const FUTURE_TRAINING = {
  id: 'e-train',
  team_id: 't-u12',
  type: 'training',
  title: 'Tuesday training',
  starts_at: '2099-01-05T15:00:00Z',
}

function renderAt(path = '/squad/t-u12/match-roster') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/squad/:teamId/match-roster" element={<MatchRosterPicker />} />
      </Routes>
    </MemoryRouter>,
  )
}

const COACH = [{ role: 'coach', team_id: 't-u12', status: 'active' }]

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: TEAMS, loading: false })
  listEventsMock.mockResolvedValue([FUTURE_MATCH_A, FUTURE_MATCH_B, PAST_MATCH, FUTURE_TRAINING])
  listAvailabilityForEventsMock.mockResolvedValue([
    { event_id: 'e-m1', player_id: 'p1', status: 'in' },
    { event_id: 'e-m1', player_id: 'p2', status: 'in' },
    { event_id: 'e-m1', player_id: 'p3', status: 'maybe' },
    { event_id: 'e-m1', player_id: 'p4', status: 'out' },
  ])
  listLineupCountsMock.mockResolvedValue(new Map([['e-m2', 1]]))
})

describe('the gate', () => {
  it('turns a parent-only account away with "not your squad"', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }],
      teams: TEAMS,
      loading: false,
    })
    renderAt()
    expect(await screen.findByText(/isn't one of your squads/i)).toBeInTheDocument()
    expect(listEventsMock).not.toHaveBeenCalled()
  })
})

describe('the list', () => {
  it('shows upcoming matches only — no past matches, no training', async () => {
    renderAt()
    const list = await screen.findByTestId('match-roster-picker')
    expect(within(list).getByText(/Dubai Falcons/)).toBeInTheDocument()
    expect(within(list).getByText(/Al Ain Amblers/)).toBeInTheDocument()
    expect(within(list).queryByText(/Sharjah/)).not.toBeInTheDocument()
    expect(within(list).queryByText(/Tuesday training/)).not.toBeInTheDocument()
  })

  it('every row links to the Lineup screen for its fixture', async () => {
    renderAt()
    const list = await screen.findByTestId('match-roster-picker')
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/lineup/e-m1',
      '/lineup/e-m2',
    ])
  })

  it('tallies RSVPs per fixture and badges only the fixture with a lineup', async () => {
    renderAt()
    const list = await screen.findByTestId('match-roster-picker')
    const [rowA, rowB] = within(list).getAllByRole('listitem')
    expect(within(rowA).getByText('2 in')).toBeInTheDocument()
    expect(within(rowA).getByText(/1 maybe · 1 out/)).toBeInTheDocument()
    expect(within(rowA).queryByText(/Lineup started/i)).not.toBeInTheDocument()
    expect(within(rowB).getByText(/No replies yet/)).toBeInTheDocument()
    expect(within(rowB).getByText(/Lineup started/i)).toBeInTheDocument()
  })

  it('a lineup-count failure costs the badge, not the page', async () => {
    listLineupCountsMock.mockRejectedValue(new Error('nope'))
    renderAt()
    const list = await screen.findByTestId('match-roster-picker')
    expect(within(list).getByText(/Dubai Falcons/)).toBeInTheDocument()
    expect(within(list).queryByText(/Lineup started/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says rosters are per fixture when nothing is coming up', async () => {
    listEventsMock.mockResolvedValue([PAST_MATCH, FUTURE_TRAINING])
    renderAt()
    expect(await screen.findByText(/No upcoming matches/i)).toBeInTheDocument()
  })
})
