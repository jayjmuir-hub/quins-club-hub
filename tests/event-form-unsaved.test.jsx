import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The event form asks before discarding typed work — Task 2 of
// claude/plans/2026-09-02-ux-unsaved-work.md. Found by the 2 Sep 2026 UX
// review: on desktop the sheet is a 520px modal, and one click on the page
// behind it (or an Escape pressed a beat too late) threw away twenty fields.
//
// Mocks mirror tests/event-form.test.jsx so nothing here can reach a network.

const useMembershipsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
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

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const COACH_U12 = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u12' }]

function renderForm() {
  useMembershipsMock.mockReturnValue({
    memberships: COACH_U12,
    teams: [TEAM_U12],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onClose = vi.fn()
  render(<EventForm event={null} onClose={onClose} onSaved={vi.fn()} />)
  return { onClose, user: userEvent.setup() }
}

beforeEach(() => {
  useMembershipsMock.mockReset()
})

describe('EventForm — unsaved changes', () => {
  it('closes at once when nothing was typed', async () => {
    const { onClose, user } = renderForm()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks before discarding typed work, and keeps editing on request', async () => {
    const { onClose, user } = renderForm()
    await user.type(screen.getByLabelText(/opponent/i), 'Dubai Exiles')
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    const ask = await screen.findByRole('alertdialog', { name: /discard your changes/i })
    expect(ask).toHaveAttribute('data-testid', 'discard-confirm')
    await user.click(within(ask).getByRole('button', { name: /keep editing/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText(/opponent/i)).toHaveValue('Dubai Exiles')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('discards on the second tap', async () => {
    const { onClose, user } = renderForm()
    await user.type(screen.getByLabelText(/opponent/i), 'D')
    await user.keyboard('{Escape}')
    const ask = await screen.findByRole('alertdialog', { name: /discard your changes/i })
    await user.click(within(ask).getByRole('button', { name: /^discard$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('is clean again once the typing is undone', async () => {
    // Dirty is a comparison, not a counter: type, delete, Escape → closes.
    const { onClose, user } = renderForm()
    const box = screen.getByLabelText(/opponent/i)
    await user.type(box, 'D')
    await user.clear(box)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
