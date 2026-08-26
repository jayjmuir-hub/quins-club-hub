import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// src/screens/DirectMessages.jsx — squad chat phase 3, reshaped 24 Aug 2026.
// One thread: the header bar, the permanent notice, block, report, remove,
// delete chat. (The inbox and the picker live in ChatList since the reshape.) Who may
// message whom is the database's (db/tests/squad-chat-phase3.sql); this
// proves the screen shows what the database hands it and nothing else.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMyConversations: vi.fn(),
  listMyMessageReads: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  subscribeReactions: vi.fn(),
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
  removeMessage: vi.fn(),
  deleteConversation: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: async () => new Map(),
  setNickname: async () => {},
}))
vi.mock('../src/data/messages.js', () => ({
  listMyConversations: (...a) => m.listMyConversations(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
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
  removeMessage: (...a) => m.removeMessage(...a),
  deleteConversation: (...a) => m.deleteConversation(...a),
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
        <Route path="/chat" element={<div>the list</div>} />
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
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  m.listDmCandidates.mockResolvedValue([{ profile_id: OTHER, full_name: 'Zz Manager Probe', role: 'manager', via_team: 'ZZ Probe U12' }])
  m.openConversation.mockResolvedValue('c1')
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Two seats held'), dm('d2', ME, 'Thanks!')])
  m.sendDirectMessage.mockResolvedValue(dm('d3', ME, 'x'))
  m.listMyBlocks.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.subscribeMessages.mockReturnValue(() => {})
  m.removeMessage.mockResolvedValue(undefined)
  m.deleteConversation.mockResolvedValue(undefined)
})

describe('DirectMessages — /chat/dm', () => {
  it('the old inbox URL goes to the Chats list', async () => {
    renderAt('/chat/dm')
    expect(await screen.findByText('the list')).toBeInTheDocument()
  })
})

describe('DirectMessages — a thread', () => {
  // ⚠️ THE MEMBER-FACING NOTICE IS GONE SINCE 26 Aug 2026 — Jay: "remove the
  // club admins can review notice", pointing at the dock, which never showed
  // it. This reverses the 23 Aug permanent-notice ruling; the reviewing
  // banner (about the ADMIN, below) is the one that stays.
  it('shows NO notice to members — adults-only or not', async () => {
    renderAt('/chat/dm/c1')
    await screen.findAllByTestId('dm-bubble')
    expect(screen.queryByTestId('dm-notice')).toBeNull()
  })

  it('shows no notice even with a minor in it — the bubbles, and sends', async () => {
    const user = userEvent.setup()
    m.getConversation.mockResolvedValue({ ...CONV, involves_minor: true })
    renderAt('/chat/dm/c1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    expect(screen.queryByTestId('dm-notice')).toBeNull()
    expect(bubbles[0]).toHaveAttribute('data-mine', 'false')
    expect(bubbles[1]).toHaveAttribute('data-mine', 'true')
    await waitFor(() => expect(m.markMessagesRead).toHaveBeenCalledWith(ME, ['d1']))
    expect(m.logWelfareAccess).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Message'), 'See you Saturday')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    // Round 2 rides along: no quote, no photo unless the user set one up.
    expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'See you Saturday', { quotedId: null, attachmentPath: null })
  })

  it('block hides the composer and says so; unblock brings it back', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findByTestId('dm-composer')
    m.listMyBlocks.mockResolvedValue(new Set([OTHER]))
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Block Zz Manager Probe' }))
    expect(m.blockDm).toHaveBeenCalledWith(OTHER)
    expect(await screen.findByTestId('dm-blocked')).toBeInTheDocument()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
  })

  it('reports a message from the other side with a reason', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findAllByTestId('dm-bubble')
    // Round 4: actions live in the bubble's chevron menu.
    await user.click(within((await screen.findAllByTestId('dm-bubble'))[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Report' }))
    await user.type(screen.getByLabelText('Report this message to the club'), 'Rude')
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(m.reportMessage).toHaveBeenCalledWith('d1', 'Rude')
  })

  it('the header says who this is private to', async () => {
    renderAt('/chat/dm/c1')
    expect(await screen.findByRole('heading', { name: 'Zz Manager Probe' })).toBeInTheDocument()
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('Private · you and Zz Manager Probe')
    expect(screen.getByRole('link', { name: 'Back to chats' })).toHaveAttribute('href', '/chat')
  })

  it('Delete on my own bubble deletes it for good', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    // Theirs offers Report in its menu, never Delete; mine offers Delete.
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(within(bubbles[1]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(m.removeMessage).toHaveBeenCalledWith('d2')
  })

  // ⚠️ "COMPLETELY" — Jay, 24 Aug 2026. Deleted for BOTH, and the copy says
  // so before the tap. (The for-me clear built earlier that day is gone.)
  it('Delete chat asks, says it is for both of you, deletes, and returns to the list', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findByTestId('dm-composer')
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete chat' }))
    const confirm = await screen.findByTestId('delete-chat-confirm')
    expect(confirm).toHaveTextContent(/deleted for both of you/)
    expect(m.deleteConversation).not.toHaveBeenCalled()
    await user.click(within(confirm).getByRole('button', { name: 'Delete chat' }))
    expect(m.deleteConversation).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('the list')).toBeInTheDocument()
  })

  it('an admin opening an adults-only conversation that is not reported gets the not-available card and nothing is logged', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-9' } })
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: [] })
    m.listMyConversations.mockResolvedValue([])
    m.getConversation.mockResolvedValue(null)   // RLS: no row for this reader
    m.listDirectMessages.mockResolvedValue([])
    renderAt('/chat/dm/c1')
    expect(await screen.findByTestId('dm-missing')).toHaveTextContent(/private to them unless a message in it is reported/)
    expect(screen.queryByTestId('dm-notice')).toBeNull()
    expect(m.logWelfareAccess).not.toHaveBeenCalled()
  })

  // ⚠️ THE RULING MADE VISIBLE — AND NARROWED THE SAME EVENING. This path now
  // only exists for a conversation the database lets the admin read: one that
  // involves a minor, or one with a reported message. An admin who is not a participant sees the
  // thread read-only, the notice says the open was recorded, and it WAS.
  it('an admin who is not in it reads only, sees the review notice, and the open is logged', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-9' } })
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: [] })
    m.listMyConversations.mockResolvedValue([])
    m.getConversation.mockResolvedValue({ ...CONV, involves_minor: true })
    renderAt('/chat/dm/c1')
    const notice = await screen.findByTestId('dm-notice')
    expect(notice).toHaveTextContent(/reviewing a private conversation as a club admin/)
    expect(await screen.findByTestId('dm-readonly')).toBeInTheDocument()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
    await waitFor(() => expect(m.logWelfareAccess).toHaveBeenCalledWith('c1'))
  })
})
