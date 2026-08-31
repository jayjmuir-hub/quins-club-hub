import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// THE ALBUM COMPOSER — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), tasks 4 and 5.
// Several photos in one tray, one message carrying all of them, and an
// upload that is ALL OR NOTHING. Rendered through the real DM screen so the
// hook, the tray strip and the send are proved together — a tray that holds
// three photos and a send that posts one is exactly the bug worth catching.
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

/** The tray's thumbnails, in order. */
const thumbs = () => screen.queryAllByTestId('tray-thumb')

async function attach(user, files) {
  await user.upload(screen.getByTestId('photo-input'), files)
}

describe('the tray holds several photos', () => {
  it('takes three at once from the picker and shows three thumbnails', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await attach(user, [img('a.jpg'), img('b.jpg'), img('c.jpg')])
    expect(thumbs()).toHaveLength(3)
  })

  it('⚠️ the input says `multiple`, or a phone can only ever pick one', async () => {
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    // Paste and drop are desktop-only; multi-select from the picker is the
    // ONLY way a phone reaches an album at all.
    expect(screen.getByTestId('photo-input')).toHaveAttribute('multiple')
  })

  it('each ✕ names WHICH photo it removes, and removing one keeps the rest', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await attach(user, [img('a.jpg'), img('b.jpg'), img('c.jpg')])
    // claude/specs/accessibility.md: three buttons called "Remove photo" are
    // three identical announcements. Screenshots paste in as image.png, so
    // the position is the only thing that tells them apart.
    await user.click(screen.getByRole('button', { name: 'Remove photo 2 of 3' }))
    expect(thumbs()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remove photo 2 of 2' })).toBeInTheDocument()
  })

  it('refuses an eleventh photo and says so, keeping the ten', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await attach(user, Array.from({ length: 11 }, (_, i) => img(`p${i}.jpg`)))
    expect(thumbs()).toHaveLength(10)
    expect(screen.getByRole('alert')).toHaveTextContent(/10 photos/i)
  })
})

describe('sending the album', () => {
  it('uploads every photo and sends ONE message carrying all of them', async () => {
    const user = userEvent.setup()
    media.uploadChatPhoto
      .mockResolvedValueOnce(`${ME}/k1.jpg`)
      .mockResolvedValueOnce(`${ME}/k2.jpg`)
      .mockResolvedValueOnce(`${ME}/k3.jpg`)
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await attach(user, [img('a.jpg'), img('b.jpg'), img('c.jpg')])
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(m.sendDirectMessage).toHaveBeenCalledTimes(1))
    expect(media.uploadChatPhoto).toHaveBeenCalledTimes(3)
    // ⚠️ EXACT, not objectContaining. The exactness is what would catch a
    // stray option reaching the database (plan 2, task 4 step 4).
    expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', '', {
      quotedId: null,
      mentions: [],
      attachments: [
        { file: `${ME}/k1.jpg`, type: 'image/jpeg', size: 1, name: 'a.jpg' },
        { file: `${ME}/k2.jpg`, type: 'image/jpeg', size: 1, name: 'b.jpg' },
        { file: `${ME}/k3.jpg`, type: 'image/jpeg', size: 1, name: 'c.jpg' },
      ],
    })
    await waitFor(() => expect(thumbs()).toHaveLength(0))
  })

  it('⚠️ keeps the ORIGINAL filename, which the storage key cannot carry', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await attach(user, [img('Fixtures September.jpg')])
    await user.click(screen.getByRole('button', { name: 'Send' }))
    // preparePhotoUpload re-encodes to JPEG and the key is <uuid>.jpg, so
    // this name exists nowhere else. It is the whole reason for the 1 Sep
    // metadata reshape, and a document in chat later is useless without it.
    await waitFor(() =>
      expect(m.sendDirectMessage.mock.calls[0][2].attachments[0].name).toBe('Fixtures September.jpg'),
    )
  })

  it('⚠️ on a failed upload sends NOTHING, deletes what it uploaded, and keeps the draft', async () => {
    const user = userEvent.setup()
    media.uploadChatPhoto
      .mockResolvedValueOnce(`${ME}/k1.jpg`)
      .mockRejectedValueOnce(new Error('network'))
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await user.type(screen.getByLabelText('Message'), 'tour')
    await attach(user, [img('a.jpg'), img('b.jpg')])
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(m.sendDirectMessage).not.toHaveBeenCalled()
    // ⚠️ Nothing half-arrives, and nothing is left behind: the first photo
    // reached storage and must be taken back out, or the reaper inherits an
    // orphan nobody knows about.
    expect(media.removeChatPhoto).toHaveBeenCalledWith(`${ME}/k1.jpg`)
    // The draft and the tray survive, so the retry costs one tap.
    expect(screen.getByLabelText('Message')).toHaveValue('tour')
    expect(thumbs()).toHaveLength(2)
  })

  it('counts out loud rather than spinning blankly', async () => {
    const user = userEvent.setup()
    let release
    media.uploadChatPhoto.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve(`${ME}/k1.jpg`) }),
    )
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    await attach(user, [img('a.jpg'), img('b.jpg'), img('c.jpg')])
    await user.click(screen.getByRole('button', { name: 'Send' }))
    // ⚠️ Ten uploads is the same road as the 28 Aug slow-site incident (UAE
    // fixed line to Supabase Tokyo, 15-second hangs). A blank spinner there
    // is indistinguishable from a hang.
    expect(await screen.findByTestId('send-progress')).toHaveTextContent('Sending 1 of 3')
    release()
  })
})
