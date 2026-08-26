import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Round 3 — the WhatsApp design pass in the DM/group thread
// (claude/plans/2026-08-24-chat-round-3-design.md): day dividers, the
// side-mounted reaction trigger, quins-green own bubbles with the stamp
// inside, private nicknames, and the wallpaper picker.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMyConversations: vi.fn(),
  listMyMessageReads: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  subscribeReactions: vi.fn(),
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
  forwardMessagesTo: vi.fn(),
  listChats: vi.fn(),
  listGroupMembers: vi.fn(),
}
const nickApi = {
  listMyNicknames: vi.fn(),
  setNickname: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: (...a) => nickApi.listMyNicknames(...a),
  setNickname: (...a) => nickApi.setNickname(...a),
}))
vi.mock('../src/data/chatMedia.js', () => ({
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
  signChatPhotoUrl: vi.fn(async () => null),
}))
// Presence is a live websocket; tests get a quiet empty room.
vi.mock('../src/lib/presence.js', () => ({
  usePresence: () => new Map(),
  dotState: (map, id) => (id && map?.get?.(id)) || 'offline',
}))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
  listMyConversations: (...a) => m.listMyConversations(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
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
  forwardMessagesTo: (...a) => m.forwardMessagesTo(...a),
  listChats: (...a) => m.listChats(...a),
  listGroupMembers: (...a) => m.listGroupMembers(...a),
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
const INBOX_ROW = { conversation_id: 'c1', other_id: OTHER, other_name: 'Zz Manager Probe', other_role: 'manager', last_at: '2026-08-23T08:00:00Z', last_body: 'x', last_author_id: OTHER, unread: false }
const dm = (id, author, body, created, extra = {}) => ({
  id,
  conversation_id: 'c1',
  channel: 'dm',
  author_id: author,
  body,
  created_at: created,
  deleted_at: null,
  quoted_id: null,
  quoted: null,
  forwarded: false,
  attachment_path: null,
  author: { full_name: author === ME ? 'Me' : 'Zz Manager Probe' },
  ...extra,
})

function renderThread() {
  return render(
    <MemoryRouter initialEntries={['/chat/dm/c1']}>
      <Routes>
        <Route path="/chat/dm/:conversationId" element={<DirectMessages />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Two days apart so a divider must appear between them.
const OLD_MSG = dm('d1', OTHER, 'From last week', '2026-08-18T08:00:00Z')
const NEW_MSG = dm('d2', ME, 'From today', new Date().toISOString())

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [] })
  m.listMyConversations.mockResolvedValue([INBOX_ROW])
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([OLD_MSG, NEW_MSG])
  m.sendDirectMessage.mockResolvedValue(dm('d9', ME, 'x', new Date().toISOString()))
  m.listMyBlocks.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.subscribeMessages.mockReturnValue(() => {})
  m.listGroupMembers.mockResolvedValue([])
  nickApi.listMyNicknames.mockResolvedValue(new Map())
  nickApi.setNickname.mockResolvedValue(undefined)
})

describe('day dividers', () => {
  it('one before each day, Today for today, a date for last week', async () => {
    renderThread()
    const dividers = await screen.findAllByTestId('day-divider')
    expect(dividers).toHaveLength(2)
    expect(dividers[0]).toHaveTextContent(/18.*Aug/)
    expect(dividers[1]).toHaveTextContent('Today')
  })
})

describe('the bubble, round-3 shape', () => {
  it('own bubbles are quins green with the stamp INSIDE, and no You label', async () => {
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    const mineBubble = bubbles[1].querySelector('[class*="bg-accent-deep"]')
    expect(mineBubble).not.toBeNull()
    // the stamp rides inside the body paragraph, not a separate meta row
    expect(within(bubbles[1]).getByText('From today').textContent).toMatch(/From today/)
    expect(within(bubbles[1]).queryByText('You')).not.toBeInTheDocument()
  })

  it('the reaction trigger sits BESIDE the bubble — right of theirs, left of mine', async () => {
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    const theirs = within(bubbles[0]).getByTestId('reaction-trigger')
    // theirs: bubble first, trigger LAST (to its right)
    expect(bubbles[0].lastElementChild).toBe(theirs)
    const mineTrigger = within(bubbles[1]).getByTestId('reaction-trigger')
    // mine: trigger FIRST (to its left)
    expect(bubbles[1].firstElementChild).toBe(mineTrigger)
    // picking from the side trigger toggles on the message
    const user = userEvent.setup()
    await user.click(within(theirs).getByRole('button', { name: 'Add reaction' }))
    await user.click(screen.getAllByText('👏')[0])
    await waitFor(() => expect(m.toggleReaction).toHaveBeenCalledWith('d1', ME, '👏', true))
  })
})

describe('nicknames', () => {
  it('a label replaces their name in the header, and saving goes through setNickname', async () => {
    nickApi.listMyNicknames.mockResolvedValue(new Map([[OTHER, 'Zz Skipper']]))
    const user = userEvent.setup()
    renderThread()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Zz Skipper' })).toBeInTheDocument())
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('Private · you and Zz Skipper')

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Nickname for Zz Skipper' }))
    const input = screen.getByLabelText(/Your nickname for/)
    await user.clear(input)
    await user.type(input, 'Zz Cap')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(nickApi.setNickname).toHaveBeenCalledWith(ME, OTHER, 'Zz Cap'))
  })
})

describe('the wallpaper', () => {
  it('picking a preset paints the stream and persists per device', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Chat background' }))
    await user.click(within(screen.getByTestId('background-picker')).getByRole('button', { name: /Club doodle/ }))
    const stream = document.querySelector('[data-background]')
    expect(stream.getAttribute('data-background')).toBe('doodle')
    expect(stream.style.backgroundImage).toContain('/chat-backgrounds/doodle.jpg')
    expect(stream.style.backgroundImage).toContain('url(')
    expect(stream.style.backgroundImage).not.toContain('data:image/svg+xml')
    expect(localStorage.getItem('chat-background')).toBe('doodle')
  })
})
