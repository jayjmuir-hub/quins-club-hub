import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Round 4 in the DM/group thread (claude/plans/2026-08-24-chat-round-4.md):
// the chevron menu, pins, stars, reply-privately, and the reaction pill
// overlapping the bubble corner. Who may is the database's
// (db/tests/chat-round-4.sql); this proves the screen's wiring.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMyConversations: vi.fn(),
  listMyMessageReads: vi.fn(),
  listMyStars: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  toggleStar: vi.fn(),
  subscribeReactions: vi.fn(),
  getConversation: vi.fn(),
  listDirectMessages: vi.fn(),
  listGroupMembers: vi.fn(),
  openConversation: vi.fn(),
  sendDirectMessage: vi.fn(),
  setPinned: vi.fn(),
  listMyBlocks: vi.fn(),
  blockDm: vi.fn(),
  unblockDm: vi.fn(),
  reportMessage: vi.fn(),
  logWelfareAccess: vi.fn(),
  markMessagesRead: vi.fn(),
  subscribeMessages: vi.fn(),
  removeMessage: vi.fn(),
  deleteConversation: vi.fn(),
  forwardMessagesTo: vi.fn(),
  listChats: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: async () => new Map(),
  setNickname: async () => {},
}))
vi.mock('../src/data/chatMedia.js', () => ({
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
  signChatPhotoUrl: vi.fn(async () => null),
}))
// Presence is a live websocket; tests get a quiet empty room.
vi.mock('../src/lib/presence.js', () => ({ usePresence: () => new Set() }))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
  listMyConversations: (...a) => m.listMyConversations(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  listMyStars: (...a) => m.listMyStars(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  toggleStar: (...a) => m.toggleStar(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
  getConversation: (...a) => m.getConversation(...a),
  listDirectMessages: (...a) => m.listDirectMessages(...a),
  listGroupMembers: (...a) => m.listGroupMembers(...a),
  openConversation: (...a) => m.openConversation(...a),
  sendDirectMessage: (...a) => m.sendDirectMessage(...a),
  setPinned: (...a) => m.setPinned(...a),
  listMyBlocks: (...a) => m.listMyBlocks(...a),
  blockDm: (...a) => m.blockDm(...a),
  unblockDm: (...a) => m.unblockDm(...a),
  reportMessage: (...a) => m.reportMessage(...a),
  logWelfareAccess: (...a) => m.logWelfareAccess(...a),
  markMessagesRead: (...a) => m.markMessagesRead(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
  removeMessage: (...a) => m.removeMessage(...a),
  deleteConversation: (...a) => m.deleteConversation(...a),
  forwardMessagesTo: (...a) => m.forwardMessagesTo(...a),
  listChats: (...a) => m.listChats(...a),
  leaveGroup: vi.fn(),
  renameGroup: vi.fn(),
}))
vi.mock('../src/screens/ChatList.jsx', () => ({
  RowAvatar: () => <span />,
  scopeChatRows: (rows) => rows,
  previewLine: () => '',
}))

import DirectMessages from '../src/screens/DirectMessages.jsx'

const ME = 'me-1'
const OTHER = 'other-1'
const PARENT = [{ id: 'm1', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: 'club-1', status: 'active' }]
const CONV = { id: 'c1', club_id: 'club-1', profile_a: ME < OTHER ? ME : OTHER, profile_b: ME < OTHER ? OTHER : ME }
const GROUP_CONV = { id: 'g1', club_id: 'club-1', kind: 'group', title: 'Zz Probe Carpool' }
const INBOX_ROW = { conversation_id: 'c1', other_id: OTHER, other_name: 'Zz Manager Probe', other_role: 'manager', last_at: '2026-08-23T08:00:00Z', last_body: 'x', last_author_id: OTHER, unread: false }
const dm = (id, author, body, extra = {}) => ({
  id,
  conversation_id: 'c1',
  channel: 'dm',
  author_id: author,
  body,
  created_at: '2026-08-23T08:00:00Z',
  deleted_at: null,
  quoted_id: null,
  quoted: null,
  forwarded: false,
  pinned: false,
  attachment_path: null,
  author: { full_name: author === ME ? 'Me' : 'Zz Manager Probe' },
  ...extra,
})

function renderThread(id = 'c1', state = undefined) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/chat/dm/${id}`, state }]}>
      <Routes>
        <Route path="/chat/dm/:conversationId" element={<DirectMessages />} />
        <Route path="/chat" element={<div>the list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [] })
  m.listMyConversations.mockResolvedValue([INBOX_ROW])
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.listMyStars.mockResolvedValue(new Set())
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Two seats held'), dm('d2', ME, 'Thanks!')])
  m.listGroupMembers.mockResolvedValue([])
  m.sendDirectMessage.mockResolvedValue(dm('d9', ME, 'x'))
  m.setPinned.mockResolvedValue(undefined)
  m.toggleStar.mockResolvedValue(undefined)
  m.openConversation.mockResolvedValue('c9')
  m.listMyBlocks.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.subscribeMessages.mockReturnValue(() => {})
})

describe('the chevron menu', () => {
  it('mine offers Delete and no Report or Reply-privately; theirs the reverse in a DM', async () => {
    const user = userEvent.setup()
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[1]).getByRole('button', { name: 'Message options' }))
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Report' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Reply privately' })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
  })

  it('Copy puts the body on the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Two seats held')
  })
})

describe('pins', () => {
  it('Pin goes through setPinned; a pinned message wears the mark and rides the banner', async () => {
    const user = userEvent.setup()
    m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Kick-off moved', { pinned: true }), dm('d2', ME, 'Thanks!')])
    renderThread()
    const banner = await screen.findByTestId('pinned-banner')
    expect(banner).toHaveTextContent('Kick-off moved')
    expect(screen.getByTestId('pin-mark')).toBeInTheDocument()

    const bubbles = screen.getAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Unpin' }))
    await waitFor(() => expect(m.setPinned).toHaveBeenCalledWith('d1', false))
  })
})

describe('stars', () => {
  it('Star toggles through toggleStar with my id, and a starred message offers Unstar', async () => {
    const user = userEvent.setup()
    m.listMyStars.mockResolvedValue(new Set(['d1']))
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Unstar' }))
    await waitFor(() => expect(m.toggleStar).toHaveBeenCalledWith(ME, 'd1', false))
  })
})

describe('reply privately', () => {
  const groupMsg = (id, author, body) => ({ ...dm(id, author, body), conversation_id: 'g1' })

  it('offered on THEIR group messages; opens the DM and lands with the quote armed', async () => {
    const user = userEvent.setup()
    m.getConversation.mockResolvedValue(GROUP_CONV)
    m.listGroupMembers.mockResolvedValue([
      { profile_id: ME, is_owner: true, full_name: 'Me Myself' },
      { profile_id: OTHER, is_owner: false, full_name: 'Zz Manager Probe' },
    ])
    m.listDirectMessages.mockResolvedValue([groupMsg('d1', OTHER, 'Bring cones')])
    renderThread('g1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply privately' }))
    await waitFor(() => expect(m.openConversation).toHaveBeenCalledWith(OTHER))
  })

  it('arriving with navigation state arms the quote preview', async () => {
    renderThread('c1', { replyPrivatelyTo: dm('d7', OTHER, 'Bring cones') })
    const preview = await screen.findByTestId('quote-preview')
    expect(preview).toHaveTextContent('Bring cones')
  })
})

describe('the reaction pill', () => {
  it('hangs off the bubble corner — left of theirs, right of mine', async () => {
    m.listReactions.mockResolvedValue(new Map([
      ['d1', [{ message_id: 'd1', profile_id: ME, emoji: '👍' }]],
      ['d2', [{ message_id: 'd2', profile_id: OTHER, emoji: '❤️' }]],
    ]))
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    const theirsPill = within(bubbles[0]).getByTestId('reaction-pill')
    expect(theirsPill.className).toContain('left-2')
    expect(theirsPill.className).toContain('-bottom-3')
    const minePill = within(bubbles[1]).getByTestId('reaction-pill')
    expect(minePill.className).toContain('right-2')
  })
})
