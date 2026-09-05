import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Super-admin play-up request inbox + Home peek. Invented names.

const useMembershipsMock = vi.fn()
const listRequestsMock = vi.fn()
const decideMock = vi.fn(async () => {})

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/playups.js', () => ({
  listPlayupRequests: (...a) => listRequestsMock(...a),
  decidePlayupRequest: (...a) => decideMock(...a),
  listMyPendingPlayups: async () => [],
  answerJuniorPlayup: async () => {},
}))

import AdminPlayupRequests from '../src/screens/AdminPlayupRequests.jsx'
import PlayupRequestBanner from '../src/components/PlayupRequestBanner.jsx'

const ROW = {
  id: 'req-1',
  status: 'requested',
  kind: 'host_request',
  note: 'Need a hooker this Saturday',
  player_id: 'p-home',
  home_team_id: 'team-u13',
  guest_team_id: 'team-u14b',
  requested_by: 'prof-hc',
  players: { full_name: 'Harness Home Alderton' },
  home: { name: 'U13 Mixed' },
  guest: { name: 'U14B' },
}

beforeEach(() => {
  vi.clearAllMocks()
  listRequestsMock.mockResolvedValue([ROW])
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'admin', status: 'active', is_super: true, team_id: null }],
    teams: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
})

describe('Admin play-up request inbox', () => {
  it('lists an open request and lets a super admin approve it', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminPlayupRequests />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Harness Home Alderton')).toBeInTheDocument()
    expect(screen.getByText(/U13 Mixed/)).toBeInTheDocument()
    expect(screen.getByText(/U14B/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(decideMock).toHaveBeenCalledWith('req-1', true, ''))
  })

  it('declines with an optional note', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminPlayupRequests />
      </MemoryRouter>,
    )
    await screen.findByText('Harness Home Alderton')
    await user.type(screen.getByLabelText(/note to the requester/i), 'Already have numbers')
    await user.click(screen.getByRole('button', { name: /^decline$/i }))
    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith('req-1', false, 'Already have numbers'),
    )
  })
})

describe('Home play-up request peek', () => {
  it('shows a super admin the open queue and links to the inbox', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlayupRequestBanner />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('playup-request-banner')).toHaveTextContent(/play-up request/i)
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/admin/playups')
  })

  it('is absent for a head coach who is not a super admin', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'coach', status: 'active', is_head_coach: true, team_id: 'team-u14b' }],
      teams: [],
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlayupRequestBanner />
      </MemoryRouter>,
    )
    await waitFor(() => expect(listRequestsMock).not.toHaveBeenCalled())
    expect(screen.queryByTestId('playup-request-banner')).toBeNull()
  })
})
