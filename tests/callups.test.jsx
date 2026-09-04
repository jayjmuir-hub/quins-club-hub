import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// U18 call-ups — claude/plans/2026-09-02-senior-squads.md Part 3 (4 Sep 2026).
// The database decides who may do what; these tests pin what each seat is
// OFFERED and what the RPCs are called with.

const useMembershipsMock = vi.fn()
const listCallupsMock = vi.fn()
const answerCallupMock = vi.fn()
const endCallupMock = vi.fn()
const listCandidatesMock = vi.fn()
const requestCallupMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/callups.js', () => ({
  listCallups: (...a) => listCallupsMock(...a),
  answerCallup: (...a) => answerCallupMock(...a),
  endCallup: (...a) => endCallupMock(...a),
  listCallupCandidates: (...a) => listCandidatesMock(...a),
  requestCallup: (...a) => requestCallupMock(...a),
}))

import Callups from '../src/screens/Callups.jsx'
import CallupCard from '../src/components/CallupCard.jsx'
import CallupBanner from '../src/components/CallupBanner.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const REQ_OPEN = { id: 'r1', club_id: CLUB, player_id: 'p-minor', home_team_id: 't-u18', senior_team_id: 't-men2', status: 'requested', created_at: '2026-09-04T08:00:00Z', players: { full_name: 'Idris Vantongeren' }, home: { name: 'U18B' }, senior: { name: 'Senior Men - 2nd XV' } }
const REQ_DONE = { id: 'r2', club_id: CLUB, player_id: 'p-minor', home_team_id: 't-u18', senior_team_id: 't-men2', status: 'consented', created_at: '2026-08-20T08:00:00Z', decided_at: '2026-08-21T08:00:00Z', players: { full_name: 'Idris Vantongeren' }, home: { name: 'U18B' }, senior: { name: 'Senior Men - 2nd XV' } }

const PARENT = [{ id: 'm1', role: 'parent', status: 'active', team_id: 't-u18', player_id: 'p-minor', club_id: CLUB }]
const SENIOR_COACH = [{ id: 'm2', role: 'coach', status: 'active', team_id: 't-men2', club_id: CLUB }]
const U18_COACH = [{ id: 'm3', role: 'coach', status: 'active', team_id: 't-u18', club_id: CLUB }]

function wrap(ui, memberships) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [], loading: false, error: null, reload: vi.fn() })
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  listCallupsMock.mockResolvedValue([REQ_OPEN, REQ_DONE])
  answerCallupMock.mockResolvedValue({ ...REQ_OPEN, status: 'consented' })
  endCallupMock.mockResolvedValue({ ...REQ_DONE, status: 'removed' })
  requestCallupMock.mockResolvedValue({ id: 'r3', status: 'requested' })
})

describe('Call-ups — the family', () => {
  it('sees the ask for their child and says yes', async () => {
    const user = wrap(<Callups />, PARENT)
    const open = await screen.findByTestId('callup-open')
    expect(open).toHaveTextContent('Senior Men - 2nd XV would like to call up Idris Vantongeren')
    await user.click(within(open).getByRole('button', { name: /yes, they can play/i }))
    await waitFor(() => expect(answerCallupMock).toHaveBeenCalledWith('r1', true))
  })

  it('or says not this time', async () => {
    const user = wrap(<Callups />, PARENT)
    const open = await screen.findByTestId('callup-open')
    await user.click(within(open).getByRole('button', { name: /not this time/i }))
    await waitFor(() => expect(answerCallupMock).toHaveBeenCalledWith('r1', false))
  })

  it('CONTROL: cannot end a call-up', async () => {
    wrap(<Callups />, PARENT)
    await screen.findByTestId('callup-decided')
    expect(screen.queryByRole('button', { name: /end call-up/i })).not.toBeInTheDocument()
  })
})

describe('Call-ups — the staff', () => {
  it('⚠️ the U18 staff are told and offered nothing: inform only, no veto', async () => {
    wrap(<Callups />, U18_COACH)
    const open = await screen.findByTestId('callup-open')
    expect(open).toHaveTextContent('The family decides. You are told what they say.')
    expect(within(open).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /end call-up/i })).not.toBeInTheDocument()
  })

  it('the senior squad’s staff can end an active call-up, and cannot answer for the family', async () => {
    const user = wrap(<Callups />, SENIOR_COACH)
    const open = await screen.findByTestId('callup-open')
    expect(within(open).queryByRole('button')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /end call-up/i }))
    await waitFor(() => expect(endCallupMock).toHaveBeenCalledWith('r2'))
  })
})

describe('the Squad Hub card', () => {
  it('lists the candidates by name, home squad and state, and asks the family with one tap', async () => {
    listCandidatesMock.mockResolvedValue([
      { player_id: 'p-a', full_name: 'Idris Vantongeren', home_team_id: 't-u18', home_team: 'U18B', state: 'consent_needed', request_id: null },
      { player_id: 'p-b', full_name: 'Rafferty Nwosu', home_team_id: 't-u18', home_team: 'U18B', state: 'requested', request_id: 'r9' },
      { player_id: 'p-c', full_name: 'Tobias Achterberg', home_team_id: 't-u18', home_team: 'U18B', state: 'in_squad', request_id: null },
    ])
    const user = wrap(<CallupCard team={{ id: 't-men2', name: 'Senior Men - 2nd XV', is_senior: true }} />, SENIOR_COACH)
    const rows = await screen.findAllByTestId('callup-candidate')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('U18B · Consent needed')
    expect(rows[1]).toHaveTextContent('Asked — waiting')
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument()
    expect(rows[2]).toHaveTextContent('In this squad')
    await user.click(within(rows[0]).getByRole('button', { name: /ask the family/i }))
    await waitFor(() => expect(requestCallupMock).toHaveBeenCalledWith('p-a', 't-men2'))
    // No birthday anywhere on the card — the list never carries one.
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).not.toBeInTheDocument()
  })

  it('CONTROL: renders nothing for a junior squad, and nothing when the database refuses', async () => {
    listCandidatesMock.mockRejectedValue(new Error('refused'))
    wrap(<CallupCard team={{ id: 't-u18', name: 'U18B', is_senior: false }} />, U18_COACH)
    expect(screen.queryByTestId('callup-card')).not.toBeInTheDocument()
    expect(listCandidatesMock).not.toHaveBeenCalled()
  })
})

describe('the Home banner', () => {
  it('shows for the family with an open ask, and for nobody else', async () => {
    wrap(<CallupBanner />, PARENT)
    expect(await screen.findByTestId('callup-banner')).toHaveTextContent('Senior Men - 2nd XV would like to call up Idris Vantongeren')
    expect(screen.getByRole('link', { name: /say yes or no/i })).toHaveAttribute('href', '/callups')
  })

  it('CONTROL: a coach with no child sees no banner and no query', () => {
    wrap(<CallupBanner />, SENIOR_COACH)
    expect(screen.queryByTestId('callup-banner')).not.toBeInTheDocument()
    expect(listCallupsMock).not.toHaveBeenCalled()
  })
})
