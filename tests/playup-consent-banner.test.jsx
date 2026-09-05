import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Home card + approve/decline sheet for a junior play-up. Linked parent of
// THAT child only. Names invented. CLAUDE.md rule 9.

const useMembershipsMock = vi.fn()
const listPendingMock = vi.fn()
const answerMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/playups.js', () => ({
  listMyPendingPlayups: (...a) => listPendingMock(...a),
  answerJuniorPlayup: (...a) => answerMock(...a),
}))

import PlayupConsentBanner from '../src/components/PlayupConsentBanner.jsx'

const PARENT = [{ id: 'm1', role: 'parent', status: 'active', team_id: 't-u14', player_id: 'p-u14' }]
const COACH = [{ id: 'm2', role: 'coach', status: 'active', team_id: 't-u16' }]
const PENDING = {
  player_id: 'p-u14',
  team_id: 't-u16',
  playup_consent: 'pending',
  players: { full_name: 'Harness Playup Alderton' },
  teams: { name: 'U16B Contact' },
}

function wrap(memberships) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [], loading: false, error: null, reload: vi.fn() })
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlayupConsentBanner />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  listPendingMock.mockResolvedValue([PENDING])
  answerMock.mockResolvedValue(null)
})

describe('Play-up consent Home card', () => {
  it('shows for the linked parent and opens the approve/decline sheet', async () => {
    const user = wrap(PARENT)
    const card = await screen.findByTestId('playup-consent-banner')
    expect(card).toHaveTextContent('U16B Contact')
    expect(card).toHaveTextContent('Harness Playup Alderton')
    await user.click(screen.getByRole('button', { name: /say yes or no/i }))
    const sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveTextContent(/play-up/i)
    await user.click(within(sheet).getByRole('button', { name: /yes, they can play/i }))
    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('p-u14', 't-u16', true))
  })

  it('decline calls the RPC with no', async () => {
    const user = wrap(PARENT)
    await screen.findByTestId('playup-consent-banner')
    await user.click(screen.getByRole('button', { name: /say yes or no/i }))
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: /not this time/i }))
    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('p-u14', 't-u16', false))
  })

  it('CONTROL: a coach with no linked child sees no card and no query', () => {
    wrap(COACH)
    expect(screen.queryByTestId('playup-consent-banner')).not.toBeInTheDocument()
    expect(listPendingMock).not.toHaveBeenCalled()
  })
})
