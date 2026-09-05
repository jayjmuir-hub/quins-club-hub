import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Squad Hub Play-ups pill. Invented names. CLAUDE.md rule 9.

const useMembershipsMock = vi.fn()
const playupSourcePlayersMock = vi.fn()
const requestPlayupsMock = vi.fn(async () => {})
const nominatePlayupsMock = vi.fn(async () => {})
const listPlayupRequestsMock = vi.fn(async () => [])
const listPlayersMock = vi.fn(async () => [])

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/playups.js', () => ({
  playupSourcePlayers: (...a) => playupSourcePlayersMock(...a),
  requestJuniorPlayups: (...a) => requestPlayupsMock(...a),
  nominateJuniorPlayups: (...a) => nominatePlayupsMock(...a),
  listPlayupRequests: (...a) => listPlayupRequestsMock(...a),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
}))

import SquadPlayups from '../src/screens/SquadPlayups.jsx'

const U13 = { id: 'team-u13', name: 'U13 Mixed', sort_order: 8, is_senior: false }
const U14B = { id: 'team-u14b', name: 'U14B', sort_order: 9, is_senior: false }
const TEAMS = [U13, U14B]

function renderAt(path) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
      <Routes>
        <Route path="/squad/:teamId/playups" element={<SquadPlayups />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  playupSourcePlayersMock.mockResolvedValue([
    { player_id: 'p-home', full_name: 'Harness Home Alderton', state: 'available' },
  ])
  listPlayersMock.mockResolvedValue([
    { id: 'p-guest', full_name: 'Harness Guest Colter', team_id: 'team-u13', guest_of: 'team-u14b', playup_consent: 'pending' },
    { id: 'p-ok', full_name: 'Harness Guest Nwosu', team_id: 'team-u13', guest_of: 'team-u14b', playup_consent: 'approved' },
  ])
  listPlayupRequestsMock.mockResolvedValue([
    {
      id: 'req-1',
      status: 'requested',
      kind: 'request',
      player_id: 'p-home',
      home_team_id: 'team-u13',
      guest_team_id: 'team-u14b',
      players: { full_name: 'Harness Home Alderton' },
      home: { name: 'U13 Mixed' },
      guest: { name: 'U14B' },
    },
  ])
})

describe('Squad Hub Play-ups pill', () => {
  it('lets the host head coach pick a younger player, add a note, and Request', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u14b', is_head_coach: true }],
      teams: TEAMS,
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    const user = userEvent.setup()
    renderAt('/squad/team-u14b/playups')
    await user.click(await screen.findByRole('button', { name: /Harness Home Alderton/i }))
    await user.type(screen.getByLabelText(/note/i), 'Need a hooker this weekend')
    await user.click(screen.getByRole('button', { name: /^request$/i }))
    await waitFor(() =>
      expect(requestPlayupsMock).toHaveBeenCalledWith({
        playerIds: ['p-home'],
        guestTeamId: 'team-u14b',
        note: 'Need a hooker this weekend',
      }),
    )
  })

  it('shows open requests, awaiting parent, and approved guests on the host screen', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u14b', is_head_coach: true }],
      teams: TEAMS,
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    renderAt('/squad/team-u14b/playups')
    expect(await screen.findByTestId('playup-open-request')).toHaveTextContent('Harness Home Alderton')
    expect(screen.getByTestId('playup-awaiting-parent')).toHaveTextContent('Harness Guest Colter')
    expect(screen.getByTestId('playup-approved-guest')).toHaveTextContent('Harness Guest Nwosu')
  })

  it('lets the home manager Nominate up to an older group', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm2', role: 'manager', status: 'active', team_id: 'team-u13' }],
      teams: TEAMS,
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    listPlayersMock.mockResolvedValue([{ id: 'p-home', full_name: 'Harness Home Alderton', team_id: 'team-u13', guest_of: null }])
    const user = userEvent.setup()
    renderAt('/squad/team-u13/playups')
    await user.click(await screen.findByRole('button', { name: /Harness Home Alderton/i }))
    await user.click(await screen.findByRole('button', { name: /^U14B$/i }))
    await user.click(screen.getByRole('button', { name: /^nominate$/i }))
    await waitFor(() =>
      expect(nominatePlayupsMock).toHaveBeenCalledWith({
        playerIds: ['p-home'],
        guestTeamId: 'team-u14b',
        note: '',
      }),
    )
  })

  it('refuses an assistant coach', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm3', role: 'coach', status: 'active', team_id: 'team-u14b', is_head_coach: false }],
      teams: TEAMS,
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    renderAt('/squad/team-u14b/playups')
    expect(await screen.findByText(/head coach or age-group manager/i)).toBeInTheDocument()
    expect(playupSourcePlayersMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Harness Home Alderton/i })).not.toBeInTheDocument()
  })
})
