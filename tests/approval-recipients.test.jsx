import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/components/ApprovalRecipients.jsx — who is emailed about people waiting
// to be approved (23 Aug 2026). The list and the write are the database's
// (db/tests/notify-approvals.sql); this proves the panel groups, switches,
// and says where the floor is.
//
// ⚠️ COLLAPSED BY DEFAULT since 24 Aug 2026 (Jay: the settings card was
// standing in the middle of the approval queues). Every test that touches
// the switches opens the card first via expand() — and the collapsed state
// has its own test, so removing the collapse cannot pass silently.

const m = { listApprovalRecipients: vi.fn(), setNotifyApprovals: vi.fn() }
vi.mock('../src/data/staff.js', async (orig) => ({
  ...(await orig()),
  listApprovalRecipients: (...a) => m.listApprovalRecipients(...a),
  setNotifyApprovals: (...a) => m.setNotifyApprovals(...a),
}))

import ApprovalRecipients from '../src/components/ApprovalRecipients.jsx'

const ROWS = [
  { membership_id: 'm1', profile_id: 'p1', full_name: 'Zz Admin Probe', role: 'admin', team_id: null, team_name: null, notify: true },
  { membership_id: 'm2', profile_id: 'p2', full_name: 'Zz Coach Probe', role: 'coach', team_id: 't1', team_name: 'ZZ Probe U13', notify: true },
  { membership_id: 'm3', profile_id: 'p3', full_name: 'Zz Assistant Probe', role: 'coach', team_id: 't1', team_name: 'ZZ Probe U13', notify: false },
  { membership_id: 'm4', profile_id: 'p4', full_name: 'Zz Manager Probe', role: 'manager', team_id: 't1', team_name: 'ZZ Probe U13', notify: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  m.listApprovalRecipients.mockResolvedValue(ROWS)
  m.setNotifyApprovals.mockImplementation(async ({ membershipId, notify }) => ({ id: membershipId, notify_approvals: notify }))
})

async function expand(user) {
  await user.click(await screen.findByRole('button', { name: /approval emails/i }))
}

describe('ApprovalRecipients', () => {
  it('⚠️ opens COLLAPSED: the count is visible, the switches are not', async () => {
    render(<ApprovalRecipients />)
    // The header carries the one fact that says whether opening is needed.
    expect(await screen.findByText('3 switched on')).toBeInTheDocument()
    expect(screen.queryByTestId('recipient-row')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approval emails/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('groups admins and each squad, shows the count, and names the floor', async () => {
    const user = userEvent.setup()
    render(<ApprovalRecipients />)
    await expand(user)
    const rows = await screen.findAllByTestId('recipient-row')
    expect(rows).toHaveLength(4)
    expect(screen.getByText('Club admins · every registration')).toBeInTheDocument()
    expect(screen.getByText('ZZ Probe U13')).toBeInTheDocument()
    expect(screen.getByText('3 switched on')).toBeInTheDocument()
    expect(screen.getByText(/still reach the super admins/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Email Zz Assistant Probe about approvals' })).toHaveAttribute('aria-checked', 'false')
  })

  it('flipping a switch writes the membership and updates the count', async () => {
    const user = userEvent.setup()
    render(<ApprovalRecipients />)
    await expand(user)
    await screen.findAllByTestId('recipient-row')
    await user.click(screen.getByRole('switch', { name: 'Email Zz Assistant Probe about approvals' }))
    expect(m.setNotifyApprovals).toHaveBeenCalledWith({ membershipId: 'm3', notify: true })
    expect(await screen.findByText('4 switched on')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Email Zz Assistant Probe about approvals' })).toHaveAttribute('aria-checked', 'true')
  })

  it('a refused save is shown, and the switch stays where it was', async () => {
    const user = userEvent.setup()
    m.setNotifyApprovals.mockRejectedValue(new Error("That didn't save. Only a club admin can change who is emailed."))
    render(<ApprovalRecipients />)
    await expand(user)
    await screen.findAllByTestId('recipient-row')
    await user.click(screen.getByRole('switch', { name: 'Email Zz Coach Probe about approvals' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Only a club admin/)
    expect(screen.getByRole('switch', { name: 'Email Zz Coach Probe about approvals' })).toHaveAttribute('aria-checked', 'true')
  })
})
