import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The Welfare portal — squad chat phase 3. The SCREEN is gated on the
// `welfare` right (like TrainingGate); the data is admin-readable by RLS.

const useMembershipsMock = vi.fn()
const m = { welfareOverview: vi.fn(), listWelfareAccessLog: vi.fn(), listOpenReports: vi.fn(), removeMessage: vi.fn(), resolveReport: vi.fn() }
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
  welfareOverview: (...a) => m.welfareOverview(...a),
  listWelfareAccessLog: (...a) => m.listWelfareAccessLog(...a),
  listOpenReports: (...a) => m.listOpenReports(...a),
  removeMessage: (...a) => m.removeMessage(...a),
  resolveReport: (...a) => m.resolveReport(...a),
}))

import Welfare from '../src/screens/Welfare.jsx'
import WelfareReports from '../src/screens/WelfareReports.jsx'

const admin = (rights) => [{ id: 'm1', role: 'admin', team_id: null, club_id: 'c', status: 'active', is_super: false, admin_rights: rights }]

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({ memberships: admin(['welfare']), teams: [] })
  m.welfareOverview.mockResolvedValue([
    { kind: 'squad', id: 't1', label: 'ZZ Probe U12', detail: 'Squad · announce-only', members: 27, last_at: '2026-08-23T08:00:00Z', open_reports: 0 },
    { kind: 'dm', id: 'c1', label: 'Zz One · Zz Two', detail: 'Direct message · involves a minor', members: 2, last_at: '2026-08-23T07:00:00Z', open_reports: 1 },
  ])
  m.listWelfareAccessLog.mockResolvedValue([{ id: 'l1', opened_at: '2026-08-23T07:30:00Z', conversation_id: 'c1', admin: { full_name: 'Zz Admin Probe' } }])
  m.listOpenReports.mockResolvedValue([
    { id: 'r1', message_id: 'x1', reason: 'Rude', created_at: '2026-08-23T07:10:00Z', reporter: { full_name: 'Zz Reporter' },
      message: { id: 'x1', body: 'the message', channel: 'dm', conversation_id: 'c1', deleted_at: null, author: { full_name: 'Zz Author' } } },
  ])
  m.removeMessage.mockResolvedValue(undefined)
  m.resolveReport.mockResolvedValue(undefined)
})

describe('Welfare — the gate', () => {
  it('shows the not-your-job card to an admin without the right, and fetches nothing', async () => {
    useMembershipsMock.mockReturnValue({ memberships: admin([]), teams: [] })
    render(<MemoryRouter><Welfare /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Welfare hasn’t been added to your account/)
    expect(m.welfareOverview).not.toHaveBeenCalled()
  })
})

describe('Welfare — overview', () => {
  it('lists every channel and DM, flags a minor, links each, and shows the access log', async () => {
    render(<MemoryRouter><Welfare /></MemoryRouter>)
    const rows = await screen.findAllByTestId('welfare-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'ZZ Probe U12' })).toHaveAttribute('href', '/chat/t1')
    expect(within(rows[1]).getByRole('link', { name: 'Zz One · Zz Two' })).toHaveAttribute('href', '/chat/dm/c1')
    expect(within(rows[1]).getByText(/involves a minor/)).toHaveClass('text-danger-ink')
    expect(screen.getByTestId('reports-banner')).toHaveTextContent('1 reported message waiting')
    expect(await screen.findByTestId('access-row')).toHaveTextContent('Zz Admin Probe')
  })
})

describe('Welfare — reports', () => {
  it('shows the report and removes the message on "Remove message", resolving it', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><WelfareReports /></MemoryRouter>)
    const row = await screen.findByTestId('report-row')
    expect(within(row).getByText('“Rude”')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open where it was said' })).toHaveAttribute('href', '/chat/dm/c1')
    await user.click(within(row).getByRole('button', { name: 'Remove message' }))
    expect(m.removeMessage).toHaveBeenCalledWith('x1')
    expect(m.resolveReport).toHaveBeenCalledWith('r1')
  })

  it('"Leave it, resolve" resolves without removing', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><WelfareReports /></MemoryRouter>)
    const row = await screen.findByTestId('report-row')
    await user.click(within(row).getByRole('button', { name: 'Leave it, resolve' }))
    expect(m.removeMessage).not.toHaveBeenCalled()
    expect(m.resolveReport).toHaveBeenCalledWith('r1')
  })
})
