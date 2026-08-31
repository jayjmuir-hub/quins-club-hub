import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// DRAG A PHOTO ONTO A CONVERSATION — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), task 3.
//
// Jay's ruling: the WHOLE conversation pane is the target, with a tinted
// overlay, not just the composer bar. Three traps, each with a test:
// dragover must be prevented or the browser opens the photo as a page and
// throws the draft away; dragleave fires crossing every child so the overlay
// flickers without a depth counter; and dragging selected TEXT across the
// pane must not raise the overlay at all.
//
// Old header follows.
// Round 2 in the DM/group thread (claude/plans/2026-08-24-chat-round-2.md):
// reply-with-quote, multi-select forwarding, photo attachments. Who may do
// any of it is the database's (db/tests/chat-round-2.sql); this proves the
// screen drives the data layer with the right shapes.

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
}
const media = {
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
  signChatPhotoUrl: vi.fn(),
}
// The DM header identity line fetches the person card (26 Aug 2026);
// null here keeps this file about its own subject and network-free.
// The DM identity badges fetch member_identity (26 Aug 2026); empty here
// keeps this file about its own subject and network-free.
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
// The wallpaper rides chat_prefs since 26 Aug 2026 — quiet defaults keep
// this file about its own subject and network-free.
vi.mock('../src/data/chatPrefs.js', () => ({
  getMyChatPref: async () => null,
  setChatPref: async () => {},
  listMyChatPrefs: async () => new Map(),
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
  listGroupMembers: vi.fn(async () => []),
  leaveGroup: vi.fn(),
  renameGroup: vi.fn(),
}))
vi.mock('../src/data/chatMedia.js', () => ({
  uploadChatPhoto: (...a) => media.uploadChatPhoto(...a),
  removeChatPhoto: (...a) => media.removeChatPhoto(...a),
  signChatPhotoUrl: (...a) => media.signChatPhotoUrl(...a),
  isAudioAttachment: (p) => /\.(webm|m4a|mp4|aac|mp3|ogg)$/i.test(p || ''),
  attachmentPreviewLabel: () => '📷 Photo',
}))
vi.mock('../src/screens/ChatList.jsx', () => ({
  RowAvatar: () => <span data-testid="row-avatar" />,
  scopeChatRows: (rows) => rows,
  previewLine: () => '',
}))

import DirectMessages from '../src/screens/DirectMessages.jsx'

const ME = 'me-1'
const OTHER = 'other-1'
const PARENT = [{ id: 'm1', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: 'club-1', status: 'active' }]
const CONV = { id: 'c1', club_id: 'club-1', profile_a: ME < OTHER ? ME : OTHER, profile_b: ME < OTHER ? OTHER : ME }
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
  attachment_path: null,
  author: { full_name: author === ME ? 'Me' : 'Zz Manager Probe' },
  ...extra,
})

function renderThread() {
  return render(
    <MemoryRouter initialEntries={['/chat/dm/c1']}>
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
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Two seats held'), dm('d2', ME, 'Thanks!')])
  m.sendDirectMessage.mockResolvedValue(dm('d3', ME, 'x'))
  m.listMyBlocks.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.subscribeMessages.mockReturnValue(() => {})
  m.removeMessage.mockResolvedValue(undefined)
  m.forwardMessagesTo.mockResolvedValue(undefined)
  m.listChats.mockResolvedValue([])
  media.uploadChatPhoto.mockResolvedValue(`${ME}/uploaded.jpg`)
  media.signChatPhotoUrl.mockResolvedValue('blob:signed')
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

const img = (name) => new File(['x'], name, { type: 'image/jpeg' })

/** A drag event as the DOM hands one over. jsdom has no DataTransfer. */
function drag(kind, { files = [], types = files.length ? ['Files'] : ['text/plain'] } = {}) {
  const ev = new Event(kind, { bubbles: true, cancelable: true })
  ev.dataTransfer = { files, types }
  return ev
}

const pane = () => screen.getByTestId('chat-drop-pane')
const overlay = () => screen.queryByTestId('chat-drop-overlay')

async function ready() {
  renderThread()
  await screen.findAllByTestId('dm-bubble')
}

describe('the overlay', () => {
  it('rises for FILES', async () => {
    await ready()
    expect(overlay()).toBeNull()
    fireEvent(pane(), drag('dragenter', { files: [img('a.jpg')] }))
    expect(overlay()).toBeInTheDocument()
  })

  it('⚠️ stays down for dragged TEXT', async () => {
    // Dragging a selected word across the conversation is an ordinary thing
    // to do by accident. A pane that lights up for it is a pane that lights
    // up constantly for no reason.
    await ready()
    fireEvent(pane(), drag('dragenter', { types: ['text/plain'] }))
    expect(overlay()).toBeNull()
  })

  it('⚠️ does not flicker when the cursor crosses a child element', async () => {
    // dragleave fires on EVERY child boundary, so a naive handler drops the
    // overlay the instant the cursor moves over a bubble — which is most of
    // the pane. Counted enter/leave pairs, not a boolean.
    await ready()
    fireEvent(pane(), drag('dragenter', { files: [img('a.jpg')] }))
    const child = screen.getAllByTestId('dm-bubble')[0]
    fireEvent(child, drag('dragenter', { files: [img('a.jpg')] }))
    fireEvent(child, drag('dragleave', { files: [img('a.jpg')] }))
    expect(overlay()).toBeInTheDocument()
    fireEvent(pane(), drag('dragleave', { files: [img('a.jpg')] }))
    expect(overlay()).toBeNull()
  })

  it('goes away once the photos are dropped', async () => {
    await ready()
    fireEvent(pane(), drag('dragenter', { files: [img('a.jpg')] }))
    fireEvent(pane(), drag('drop', { files: [img('a.jpg')] }))
    await waitFor(() => expect(overlay()).toBeNull())
  })
})

describe('the drop', () => {
  it('⚠️ prevents the browser default, or the photo opens as a page and the draft is gone', async () => {
    // The classic version of this bug: the browser navigates away to the
    // dropped file, and everything typed into the composer goes with it.
    await ready()
    const over = drag('dragover', { files: [img('a.jpg')] })
    fireEvent(pane(), over)
    // ⚠️ dragover matters as much as drop: without preventDefault here the
    // element is not a drop target at all and the drop event never fires.
    expect(over.defaultPrevented).toBe(true)

    const dropped = drag('drop', { files: [img('a.jpg')] })
    fireEvent(pane(), dropped)
    expect(dropped.defaultPrevented).toBe(true)
  })

  it('attaches every dropped image', async () => {
    await ready()
    fireEvent(pane(), drag('drop', { files: [img('a.jpg'), img('b.jpg'), img('c.jpg')] }))
    expect(await screen.findAllByTestId('tray-thumb')).toHaveLength(3)
  })

  it('keeps the draft that was already typed', async () => {
    const user = userEvent.setup()
    await ready()
    await user.type(screen.getByLabelText('Message'), 'these are from Saturday')
    fireEvent(pane(), drag('drop', { files: [img('a.jpg')] }))
    expect(await screen.findAllByTestId('tray-thumb')).toHaveLength(1)
    expect(screen.getByLabelText('Message')).toHaveValue('these are from Saturday')
  })

  it('⚠️ refuses a dropped PDF and says so — `accept` never sees this door', async () => {
    // accept on the <input> filters the PICKER only. A dropped file bypasses
    // it entirely, so the tray's own gate is the only thing standing here.
    await ready()
    fireEvent(pane(), drag('drop', { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a photo/i)
    expect(screen.queryAllByTestId('tray-thumb')).toHaveLength(0)
  })
})
