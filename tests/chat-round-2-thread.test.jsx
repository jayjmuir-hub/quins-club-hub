import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
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

describe('reply-with-quote', () => {
  it('Reply arms the preview; send carries quotedId; ✕ disarms it', async () => {
    const user = userEvent.setup()
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    // Round 4: actions live in the bubble's chevron menu.
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    const preview = screen.getByTestId('quote-preview')
    expect(preview).toHaveTextContent('Replying to Zz Manager Probe')
    expect(preview).toHaveTextContent('Two seats held')

    await user.type(screen.getByLabelText('Message'), 'On it')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'On it', { quotedId: 'd1', attachmentPath: null })
    await waitFor(() => expect(screen.queryByTestId('quote-preview')).not.toBeInTheDocument())
  })

  it('an EMPTY-ARRAY quoted embed draws no quote block — the phantom-chip regression', async () => {
    // A reverse-direction embed once made `quoted` [] on every message
    // (24 Aug 2026, live): truthy, bodyless, so every bubble grew a
    // "📷 Photo" chip. The renderers now demand an object with an id.
    m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Two seats held', { quoted: [] })])
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    expect(screen.queryByTestId('quote-block')).not.toBeInTheDocument()
  })

  it('a quoted message renders its block; a soft-deleted original says "Message deleted" and never its words', async () => {
    m.listDirectMessages.mockResolvedValue([
      dm('d1', OTHER, 'Two seats held'),
      dm('d2', ME, 'On it', { quoted_id: 'd1', quoted: { id: 'd1', body: 'Two seats held', deleted_at: null, attachment_path: null, author: { full_name: 'Zz Manager Probe' } } }),
      dm('d3', ME, 'Still there?', { quoted_id: 'd1', quoted: { id: 'd1', body: 'Two seats held', deleted_at: '2026-08-23T09:00:00Z', attachment_path: null, author: { full_name: 'Zz Manager Probe' } } }),
    ])
    renderThread()
    const blocks = await screen.findAllByTestId('quote-block')
    expect(blocks[0]).toHaveTextContent('Zz Manager Probe')
    expect(blocks[0]).toHaveTextContent('Two seats held')
    expect(blocks[1]).toHaveTextContent('Message deleted')
    expect(blocks[1]).not.toHaveTextContent('Two seats held')
  })
})

describe('forwarding', () => {
  it('Forward selects, tapping adds, and the sheet hands the set to forwardMessagesTo', async () => {
    const user = userEvent.setup()
    m.listChats.mockResolvedValue([
      { kind: 'dm', conversation_id: 'c1', label: 'This same chat' },
      { kind: 'group', conversation_id: 'c9', label: 'ZZ Probe Carpool' },
    ])
    renderThread()
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Forward' }))
    expect(screen.getByTestId('forward-bar')).toHaveTextContent('1 selected')
    // The composer yields to the bar — no half-armed send under a selection.
    expect(screen.queryByTestId('dm-composer')).not.toBeInTheDocument()

    await user.click(bubbles[1].firstChild)
    expect(screen.getByTestId('forward-bar')).toHaveTextContent('2 selected')

    await user.click(screen.getByRole('button', { name: 'Forward' }))
    const sheet = await screen.findByTestId('forward-sheet')
    // The current conversation is not a destination.
    expect(within(sheet).queryByText('This same chat')).not.toBeInTheDocument()
    await user.click(within(sheet).getByText('ZZ Probe Carpool'))
    await waitFor(() =>
      expect(m.forwardMessagesTo).toHaveBeenCalledWith(
        expect.objectContaining({ conversation_id: 'c9' }),
        expect.arrayContaining([expect.objectContaining({ id: 'd1' }), expect.objectContaining({ id: 'd2' })]),
      ),
    )
    expect(screen.queryByTestId('forward-bar')).not.toBeInTheDocument()
  })

  it('a forwarded message wears the tag', async () => {
    m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Passed along', { forwarded: true })])
    renderThread()
    expect(await screen.findByTestId('forwarded-tag')).toHaveTextContent('Forwarded')
  })
})

describe('photo attachments', () => {
  it('a picked photo enables Send without text, uploads first, and sends its key', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    const file = new File(['x'], 'match.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByTestId('photo-input'), file)
    expect(screen.getByTestId('photo-preview')).toHaveTextContent('match.jpg')
    expect(send).toBeEnabled()

    await user.click(send)
    await waitFor(() => expect(media.uploadChatPhoto).toHaveBeenCalledWith(ME, file))
    expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', '', { quotedId: null, attachmentPath: `${ME}/uploaded.jpg` })
    await waitFor(() => expect(screen.queryByTestId('photo-preview')).not.toBeInTheDocument())
  })

  it('a photo message renders the image from a signed URL', async () => {
    m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, '', { attachment_path: 'other-1/pic.jpg' })])
    renderThread()
    const photo = await screen.findByTestId('chat-photo')
    expect(media.signChatPhotoUrl).toHaveBeenCalledWith('other-1/pic.jpg')
    expect(within(photo).getByRole('img')).toHaveAttribute('src', 'blob:signed')
  })

  it('deleting my own photo message also removes the object; someone else’s never does', async () => {
    const user = userEvent.setup()
    m.listDirectMessages.mockResolvedValue([dm('d2', ME, '', { attachment_path: `${ME}/pic.jpg` })])
    renderThread()
    const bubble = (await screen.findAllByTestId('dm-bubble'))[0]
    await user.click(within(bubble).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(m.removeMessage).toHaveBeenCalledWith('d2'))
    expect(media.removeChatPhoto).toHaveBeenCalledWith(`${ME}/pic.jpg`)
  })
})
