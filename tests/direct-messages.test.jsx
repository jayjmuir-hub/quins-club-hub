import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// src/screens/DirectMessages.jsx — squad chat phase 3. The inbox, the
// picker, one thread, the permanent notice, the block, the report. Who may
// message whom is the database's (db/tests/squad-chat-phase3.sql); this
// proves the screen shows what the database hands it and nothing else.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMyConversations: vi.fn(),
  listDmCandidates: vi.fn(),
  openConversation: vi.fn(),
  getConversation: vi.fn(),
  listDirectMessages: vi.fn(),
  sendDirectMessage: vi.fn(),
  listMyBlocks: vi.fn(),
  blockDm: vi.fn(),
  unblockDm: vi.fn(),
  reportMessage: vi.fn(),
  logWelfareAccess: vi.fn(),
  markMessagesRead: vi.fn(),
  subscribeMessages: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/messages.js', () => ({
  listMyConversations: (...a) => m.listMyConversations(...a),
  listDmCandidates: (...a) => m.listDmCandidates(...a),
  openConversation: (...a) => m.openConversation(...a),
  getConversation: (...a) => m.getConversation(...a),
  listDirectMessages: (...a) => m.listDirectMessages(...a),
  sendDirectMessage: (...a) => m.sendDirectMessage(...a),
  listMyBlocks: (...a) => m.listMyBlocks(...a),
  blockDm: (...a) => m.blockDm(...a),
  unblockDm: (...a) => m.unblockDm(...a),
  reportMessage: (...a) => m.reportMessage(...a),
  logWelfareAccess: (...a) => m.logWelfareAccess(...a),
  markMessagesRead: (...a) => m.markMessagesRead(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
}))

import DirectMessages from '../src/screens/DirectMessages.jsx'

const ME = 'me-1'
const OTHER = 'other-1'
const PARENT = [{ id: 'm1', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: 'club-1', status: 'active' }]
const ADMIN = [{ id: 'm2', role: 'admin', team_id: null, club_id: 'club-1', status: 'active', is_super: true }]

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chat/dm" element={<DirectMessages />} />
        <Route path="/chat/dm/:conversationId" element={<DirectMessages />} />
        <Route path="/chat" element={<div>squads</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const CONV = { id: 'c1', club_id: 'club-1', profile_a: ME < OTHER ? ME : OTHER, profile_b: ME < OTHER ? OTHER : ME }
const INBOX_ROW = { conversation_id: 'c1', other_id: OTHER, other_name: 'Zz Manager Probe', other_role: 'manager', last_at: '2026-08-23T08:00:00Z', last_body: 'Two seats held', last_author_id: OTHER, unread: true }
const dm = (id, author, body) => ({ id, conversation_id: 'c1', channel: 'dm', author_id: author, body, created_at: '2026-08-23T08:00:00Z', deleted_at: null, author: { full_name: author === ME ? 'Me' : 'Zz Manager Probe' } })

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [] })
  m.listMyConversations.mockResolvedValue([INBOX_ROW])
  m.listDmCandidates.mockResolvedValue([{ profile_id: OTHER, full_name: 'Zz Manager Probe', role: 'manager', via_team: 'ZZ Probe U12' }])
  m.openConversation.mockResolvedValue('c1')
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Two seats held'), dm('d2', ME, 'Thanks!')])
  m.sendDirectMessage.mockResolvedValue(dm('d3', ME, 'x'))
  m.listMyBlocks.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.subscribeMessages.mockReturnValue(() => {})
})

describe('DirectMessages — inbox', () => {
  it('lists conversations with the role pill, last line and unread dot', async () => {
    renderAt('/chat/dm')
    const row = await screen.findByTestId('conversation-row')
    expect(row).toHaveAttribute('href', '/chat/dm/c1')
    expect(within(row).getByText('Zz Manager Probe')).toBeInTheDocument()
    expect(within(row).getByText('Team Manager')).toBeInTheDocument()
    expect(within(row).getByText('Two seats held')).toBeInTheDocument()
    expect(within(row).getByLabelText('Unread')).toBeInTheDocument()
  })

  it('New message shows only the people the database allows, and opens the conversation on pick', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm')
    await screen.findByTestId('conversation-row')
    await user.click(screen.getByTestId('new-message'))
    const picker = await screen.findByTestId('dm-picker')
    expect(m.listDmCandidates).toHaveBeenCalled()
    expect(within(picker).getByText(/Only people you share a squad with/)).toBeInTheDocument()
    await user.click(within(picker).getByRole('button', { name: /Zz Manager Probe/ }))
    expect(m.openConversation).toHaveBeenCalledWith(OTHER)
    expect(await screen.findByTestId('dm-notice')).toBeInTheDocument()
  })
})

describe('DirectMessages — a thread', () => {
  it('shows the permanent notice naming club admins, the bubbles, and sends', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    const notice = await screen.findByTestId('dm-notice')
    expect(notice).toHaveTextContent('Private between you and Zz Manager Probe. Club admins can review this conversation.')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    expect(bubbles[0]).toHaveAttribute('data-mine', 'false')
    expect(bubbles[1]).toHaveAttribute('data-mine', 'true')
    await waitFor(() => expect(m.markMessagesRead).toHaveBeenCalledWith(ME, ['d1']))
    expect(m.logWelfareAccess).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Message'), 'See you Saturday')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'See you Saturday')
  })

  it('block hides the composer and says so; unblock brings it back', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findByTestId('dm-composer')
    m.listMyBlocks.mockResolvedValue(new Set([OTHER]))
    await user.click(screen.getByRole('button', { name: 'Block' }))
    expect(m.blockDm).toHaveBeenCalledWith(OTHER)
    expect(await screen.findByTestId('dm-blocked')).toBeInTheDocument()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
  })

  it('reports a message from the other side with a reason', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findAllByTestId('dm-bubble')
    await user.click(screen.getByRole('button', { name: 'Report' }))
    await user.type(screen.getByLabelText('Report this message to the club'), 'Rude')
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(m.reportMessage).toHaveBeenCalledWith('d1', 'Rude')
  })

  // ⚠️ THE RULING MADE VISIBLE. An admin who is not a participant sees the
  // thread read-only, the notice says the open was recorded, and it WAS.
  it('an admin who is not in it reads only, sees the review notice, and the open is logged', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-9' } })
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: [] })
    m.listMyConversations.mockResolvedValue([])
    renderAt('/chat/dm/c1')
    const notice = await screen.findByTestId('dm-notice')
    expect(notice).toHaveTextContent(/reviewing a private conversation as a club admin/)
    expect(await screen.findByTestId('dm-readonly')).toBeInTheDocument()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
    await waitFor(() => expect(m.logWelfareAccess).toHaveBeenCalledWith('c1'))
  })
})
