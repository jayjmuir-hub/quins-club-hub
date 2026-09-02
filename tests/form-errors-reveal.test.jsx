import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// After a failed submit the problem is where the person is looking — item 3
// of the 2 Sep 2026 UX review. The event form focuses its first invalid
// control; the child-registration form, which has no per-field highlights,
// focuses its alert. MyPlayerForm and PlayerForm take the same effect;
// PlayerForm is asserted in tests/player-form.test.jsx, and the helper's own
// branches in tests/reveal-problem.test.jsx.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED (CLAUDE.md rule 9).

const useMembershipsMock = vi.fn()
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: async () => ({ id: 'e-saved' }),
  deleteEvent: async () => {},
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))
vi.mock('../src/lib/useMyProfile.js', () => ({
  default: () => ({ profile: null }),
  primeMyProfileCache: vi.fn(),
}))
vi.mock('../src/data/members.js', () => ({
  registerMyPlayer: vi.fn(),
  updateProfileNames: vi.fn(),
}))
vi.mock('../src/data/players.js', () => ({ setPlayerDob: vi.fn() }))

import EventForm from '../src/screens/EventForm.jsx'
import PlayerRegistrationForm from '../src/components/PlayerRegistrationForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const COACH_U12 = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u12' }]

beforeEach(() => {
  useMembershipsMock.mockReset()
  useMembershipsMock.mockReturnValue({
    memberships: COACH_U12,
    teams: [TEAM_U12],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
})

describe('EventForm — a refused submit lands on the first invalid field', () => {
  it('moves focus to the first highlighted control, not the banner', async () => {
    const user = userEvent.setup()
    render(<EventForm event={null} onClose={vi.fn()} onSaved={vi.fn()} />)
    // A match with no opponent: opponent is required for a friendly.
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await screen.findByRole('alert')
    await waitFor(() => {
      const active = document.activeElement
      expect(active).not.toBe(document.body)
      expect(active.getAttribute('aria-invalid')).toBe('true')
    })
    // And it is the FIRST one in document order.
    const firstInvalid = document.querySelector('[aria-invalid="true"]')
    expect(document.activeElement).toBe(firstInvalid)
  })
})

describe('PlayerRegistrationForm — a refused submit lands on the alert', () => {
  it('focuses the alert, which sits above the cards the person scrolled past', async () => {
    const user = userEvent.setup()
    render(<PlayerRegistrationForm teams={[TEAM_U12]} collectOnly onCollect={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(document.activeElement).toBe(alert))
  })
})
