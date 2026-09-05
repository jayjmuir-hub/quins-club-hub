import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Roster Request / Nominate doors. Database is the gate; this file only
// asserts the UI offers them to head coach and age-group manager.
// Invented names. CLAUDE.md rule 9.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listPlayerPrivateMock = vi.fn(async () => [])
const playupSourcePlayersMock = vi.fn(async () => [])
const requestPlayupsMock = vi.fn(async () => {})
const nominatePlayupsMock = vi.fn(async () => {})

vi.mock('../src/data/parents.js', () => ({ listParents: async () => [] }))
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: async () => null,
  signPhotoUrls: async () => ({}),
}))
vi.mock('../src/data/playups.js', () => ({
  listPlayerGuestTeamIds: async () => [],
  listPlayerGuestPlayups: async () => [],
  addJuniorPlayup: async () => null,
  removeJuniorPlayup: async () => null,
  playupSourcePlayers: (...a) => playupSourcePlayersMock(...a),
  requestJuniorPlayups: (...a) => requestPlayupsMock(...a),
  nominateJuniorPlayups: (...a) => nominatePlayupsMock(...a),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  getPlayerDob: async () => null,
  getPlayerContact: async () => null,
  listPlayerPrivate: (...a) => listPlayerPrivateMock(...a),
}))
vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: async () => new Map(),
  listPlayerUnits: async () => new Map(),
  setPlayerUnit: async () => null,
  savePlayerPositions: async () => [],
  listPlayerPositions: async () => new Map(),
}))

import Roster from '../src/screens/Roster.jsx'

const U13 = { id: 'team-u13', name: 'U13 Mixed', sort_order: 8, is_senior: false }
const U14B = { id: 'team-u14b', name: 'U14B', sort_order: 9, is_senior: false }
const TEAMS = [U13, U14B]
const PLAYERS_U14 = [{ id: 'p-host', team_id: 'team-u14b', full_name: 'Harness Host Colter', guest_of: null }]
const PLAYERS_U13 = [{ id: 'p-home', team_id: 'team-u13', full_name: 'Harness Home Alderton', guest_of: null }]

function wrap(rows, teams, players) {
  useMembershipsMock.mockReturnValue({
    memberships: rows,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  listPlayersMock.mockResolvedValue(players)
  return userEvent.setup()
}

function renderRoster() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Roster />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  playupSourcePlayersMock.mockResolvedValue([
    { player_id: 'p-home', full_name: 'Harness Home Alderton', state: 'available' },
  ])
})

describe('Roster play-up request / nominate doors', () => {
  it('shows Request play-up to the U14B head coach', async () => {
    wrap(
      [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u14b', is_head_coach: true }],
      TEAMS,
      PLAYERS_U14,
    )
    renderRoster()
    expect(await screen.findByRole('button', { name: /request play-up/i })).toBeInTheDocument()
  })

  it('shows Request play-up to the U14B age-group manager', async () => {
    wrap(
      [{ id: 'm1', role: 'manager', status: 'active', team_id: 'team-u14b' }],
      TEAMS,
      PLAYERS_U14,
    )
    renderRoster()
    expect(await screen.findByRole('button', { name: /request play-up/i })).toBeInTheDocument()
  })

  it('hides Request play-up from an assistant coach', async () => {
    wrap(
      [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u14b', is_head_coach: false }],
      TEAMS,
      PLAYERS_U14,
    )
    renderRoster()
    await screen.findByText('Harness Host Colter')
    expect(screen.queryByRole('button', { name: /request play-up/i })).toBeNull()
  })

  it('hides Request play-up from a medic', async () => {
    wrap(
      [{ id: 'm1', role: 'medic', status: 'active', team_id: 'team-u14b' }],
      TEAMS,
      PLAYERS_U14,
    )
    renderRoster()
    await screen.findByText('Harness Host Colter')
    expect(screen.queryByRole('button', { name: /request play-up/i })).toBeNull()
  })

  it('shows Nominate for play-up on the home U13 roster for its head coach', async () => {
    wrap(
      [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u13', is_head_coach: true }],
      TEAMS,
      PLAYERS_U13,
    )
    renderRoster()
    expect(await screen.findByRole('button', { name: /nominate for play-up/i })).toBeInTheDocument()
  })

  it('submits a host request for the selected younger players', async () => {
    wrap(
      [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u14b', is_head_coach: true }],
      TEAMS,
      PLAYERS_U14,
    )
    const user = userEvent.setup()
    renderRoster()
    await user.click(await screen.findByRole('button', { name: /request play-up/i }))
    await user.click(await screen.findByRole('button', { name: /U13 Mixed/i }))
    await waitFor(() => expect(playupSourcePlayersMock).toHaveBeenCalled())
    await user.click(await screen.findByRole('checkbox', { name: /Harness Home Alderton/i }))
    await user.click(screen.getByRole('button', { name: /submit request/i }))
    await waitFor(() =>
      expect(requestPlayupsMock).toHaveBeenCalledWith({
        playerIds: ['p-home'],
        guestTeamId: 'team-u14b',
        note: '',
      }),
    )
  })
})
