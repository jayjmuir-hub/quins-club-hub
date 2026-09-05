import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Club Ops hybrid C: Home peek + full Ops page. Invented names.

const useMembershipsMock = vi.fn()
const listRequestsMock = vi.fn()
const decideMock = vi.fn(async () => {})
const listPlayersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/playups.js', () => ({
  listPlayupRequests: (...a) => listRequestsMock(...a),
  decidePlayupRequest: (...a) => decideMock(...a),
  listMyPendingPlayups: async () => [],
  answerJuniorPlayup: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
}))

import ClubOps from '../src/screens/ClubOps.jsx'
import ClubOpsBanner from '../src/components/ClubOpsBanner.jsx'

const SUPER = {
  memberships: [{ id: 'm1', role: 'admin', status: 'active', is_super: true, team_id: null }],
  teams: [
    { id: 'team-u13', name: 'U13 Mixed', is_senior: false },
    { id: 'team-u14b', name: 'U14B', is_senior: false },
  ],
  loading: false,
  error: null,
  reload: vi.fn(),
}

const HEAD_COACH = {
  memberships: [
    {
      id: 'm-hc',
      role: 'coach',
      status: 'active',
      is_head_coach: true,
      team_id: 'team-u14b',
    },
  ],
  teams: [
    { id: 'team-u13', name: 'U13 Mixed', is_senior: false },
    { id: 'team-u14b', name: 'U14B', is_senior: false },
  ],
  loading: false,
  error: null,
  reload: vi.fn(),
}

const ASSISTANT = {
  memberships: [{ id: 'm-as', role: 'coach', status: 'active', is_head_coach: false, team_id: 'team-u14b' }],
  teams: [{ id: 'team-u14b', name: 'U14B', is_senior: false }],
  loading: false,
  error: null,
  reload: vi.fn(),
}

const ROW = {
  id: 'req-1',
  status: 'requested',
  kind: 'host_request',
  note: 'Need a hooker this Saturday',
  player_id: 'p-home',
  home_team_id: 'team-u13',
  guest_team_id: 'team-u14b',
  requested_by: 'prof-hc',
  created_at: '2026-09-05T08:00:00Z',
  players: { full_name: 'Harness Home Alderton' },
  home: { name: 'U13 Mixed' },
  guest: { name: 'U14B' },
}

const DECLINED = {
  ...ROW,
  id: 'req-done',
  status: 'declined',
  player_id: 'p-no',
  players: { full_name: 'Harness No Carlisle' },
}

function renderOps() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ClubOps />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listRequestsMock.mockResolvedValue([ROW])
  listPlayersMock.mockResolvedValue([])
  useMembershipsMock.mockReturnValue(SUPER)
})

describe('Club Ops page — play-up inbox', () => {
  it('lists an open request and lets a super admin approve it', async () => {
    const user = userEvent.setup()
    renderOps()
    expect(await screen.findByRole('heading', { name: 'Club Ops' })).toBeInTheDocument()
    expect(await screen.findByText('Harness Home Alderton')).toBeInTheDocument()
    expect(screen.getByText(/U13 Mixed/)).toBeInTheDocument()
    expect(screen.getByText(/U14B/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(decideMock).toHaveBeenCalledWith('req-1', true, ''))
  })

  it('declines with an optional note', async () => {
    const user = userEvent.setup()
    renderOps()
    await screen.findByText('Harness Home Alderton')
    await user.type(screen.getByLabelText(/note to the requester/i), 'Already have numbers')
    await user.click(screen.getByRole('button', { name: /^decline$/i }))
    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith('req-1', false, 'Already have numbers'),
    )
  })

  it('Open hides declined rows; Done shows them', async () => {
    listRequestsMock.mockResolvedValue([ROW, DECLINED])
    const user = userEvent.setup()
    renderOps()
    expect(await screen.findByText('Harness Home Alderton')).toBeInTheDocument()
    expect(screen.queryByText('Harness No Carlisle')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^done$/i }))
    expect(await screen.findByText('Harness No Carlisle')).toBeInTheDocument()
    expect(screen.queryByText('Harness Home Alderton')).not.toBeInTheDocument()
  })

  it('a head coach sees their request status and View, never Approve', async () => {
    useMembershipsMock.mockReturnValue(HEAD_COACH)
    renderOps()
    expect(await screen.findByText('Harness Home Alderton')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^view$/i })).toHaveAttribute('href', '/roster?open=p-home')
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^decline$/i })).toBeNull()
    expect(decideMock).not.toHaveBeenCalled()
  })

  it('refuses an assistant coach at the screen, not only by hiding buttons', async () => {
    useMembershipsMock.mockReturnValue(ASSISTANT)
    renderOps()
    expect(await screen.findByRole('heading', { name: /not authorised/i })).toBeInTheDocument()
    expect(listRequestsMock).not.toHaveBeenCalled()
  })
})

describe('Home Club Ops peek', () => {
  it('shows a super admin Club Ops · N open and See all to /ops', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ClubOpsBanner />
      </MemoryRouter>,
    )
    const band = await screen.findByTestId('club-ops-banner')
    expect(band).toHaveTextContent(/Club Ops/)
    expect(band).toHaveTextContent(/1 open/)
    expect(screen.getByRole('link', { name: /see all/i })).toHaveAttribute('href', '/ops')
    expect(within(band).getByText('Harness Home Alderton')).toBeInTheDocument()
  })

  it('shows a head coach the same peek for their queue', async () => {
    useMembershipsMock.mockReturnValue(HEAD_COACH)
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ClubOpsBanner />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('club-ops-banner')).toHaveTextContent(/Club Ops/)
    expect(listRequestsMock).toHaveBeenCalled()
  })

  it('is absent for an assistant coach', async () => {
    useMembershipsMock.mockReturnValue(ASSISTANT)
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ClubOpsBanner />
      </MemoryRouter>,
    )
    await waitFor(() => expect(listRequestsMock).not.toHaveBeenCalled())
    expect(screen.queryByTestId('club-ops-banner')).toBeNull()
  })
})

describe('Club Ops routes (rot detector)', () => {
  it('mounts /ops outside /admin, and /admin/playups redirects to /ops', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src/App.jsx'), 'utf8')
    expect(app).toMatch(/path="\/ops"/)
    expect(app).toMatch(/path="\/admin\/playups"/)
    expect(app).toMatch(/<Navigate to="\/ops" replace \/>/)
    expect(app).not.toMatch(/path="playups" element=\{<AdminPlayupRequests/)
  })
})
