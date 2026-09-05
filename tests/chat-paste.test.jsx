import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// PASTE INTO A CHAT — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), task 2.
//
// ⚠️ PASTING TEXT IS A HUNDRED TIMES COMMONER THAN PASTING A PHOTO. Every
// test here that looks redundant is guarding the ordinary case: a handler
// that calls preventDefault on a text paste breaks typing into the message
// box, which is a far worse bug than the one being fixed.
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
  isFileAttachment: (p) => /\.(pdf|doc|docx|xls|xlsx|csv)$/i.test(p || ''),
  messageAttachmentLabel: () => '📷 Photo',
  chatFileAccept: () => 'application/pdf',
  uploadChatFile: vi.fn(),
  attachmentPreviewLabel: () => '📷 Photo',
  CHAT_FILE_TYPES: {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv',
    'application/csv': 'csv',
  },
  validateChatFile: (file) => {
    if (!file) return 'Choose a file first.'
    const ok = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
    ])
    if (!ok.has(file.type)) return 'That file type is not supported. Use a PDF, Word, Excel or CSV file.'
    if (file.size > 26214400) return 'That file is over the 25 MB limit.'
    return null
  },
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

import { pasteImages } from '../src/lib/chatComposer.js'

const img = (name, type = 'image/jpeg') => new File(['x'], name, { type })

/** A clipboard event as the DOM hands one over. */
function clipboard({ files = [], text = '' } = {}) {
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  ev.clipboardData = { files, getData: () => text, types: files.length ? ['Files'] : ['text/plain'] }
  return ev
}

describe('pasteImages — the gate itself', () => {
  it('⚠️ leaves a TEXT paste completely alone', () => {
    const add = vi.fn()
    const ev = clipboard({ text: 'see you Saturday' })
    expect(pasteImages(ev, add)).toBe(false)
    // Both halves matter. Not preventing the default is what lets the words
    // actually land in the box; not calling add is what stops a phantom
    // attachment appearing when somebody pastes an address.
    expect(ev.defaultPrevented).toBe(false)
    expect(add).not.toHaveBeenCalled()
  })

  it('takes over only when the clipboard carries image FILES', () => {
    const add = vi.fn()
    const pick = vi.fn()
    const ev = clipboard({ files: [img('image.png', 'image/png')] })
    expect(pasteImages(ev, add, pick)).toBe(true)
    expect(ev.defaultPrevented).toBe(true)
    expect(add).toHaveBeenCalledWith([expect.any(File)])
    expect(pick).not.toHaveBeenCalled()
  })

  it('routes a pasted PDF to pickFile, not the photo tray', () => {
    const add = vi.fn()
    const pick = vi.fn()
    const pdf = new File(['x'], 'notes.pdf', { type: 'application/pdf' })
    const ev = clipboard({ files: [pdf] })
    expect(pasteImages(ev, add, pick)).toBe(true)
    expect(ev.defaultPrevented).toBe(true)
    expect(add).not.toHaveBeenCalled()
    expect(pick).toHaveBeenCalledWith([pdf])
  })

  it('routes a pasted Excel workbook to pickFile', () => {
    const add = vi.fn()
    const pick = vi.fn()
    const xlsx = new File(['x'], 'fixture-list.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const ev = clipboard({ files: [xlsx] })
    expect(pasteImages(ev, add, pick)).toBe(true)
    expect(pick).toHaveBeenCalledWith([xlsx])
    expect(add).not.toHaveBeenCalled()
  })

  it('⚠️ a pasted zip is left to the browser, not swallowed silently', () => {
    // Copying a file in Explorer puts it on the clipboard as a File. If the
    // handler claimed every paste with files in it, a pasted zip would
    // vanish: preventDefault fires, nothing is added, nothing is said.
    const add = vi.fn()
    const pick = vi.fn()
    const ev = clipboard({ files: [new File(['x'], 'bundle.zip', { type: 'application/zip' })] })
    expect(pasteImages(ev, add, pick)).toBe(false)
    expect(ev.defaultPrevented).toBe(false)
    expect(add).not.toHaveBeenCalled()
    expect(pick).not.toHaveBeenCalled()
  })

  it('survives a clipboard with no clipboardData at all', () => {
    const add = vi.fn()
    const bare = new Event('paste', { bubbles: true, cancelable: true })
    expect(() => pasteImages(bare, add)).not.toThrow()
    expect(bare.defaultPrevented).toBe(false)
  })

  it('takes several images from one paste', () => {
    const add = vi.fn()
    pasteImages(clipboard({ files: [img('a.jpg'), img('b.jpg')] }), add)
    expect(add.mock.calls[0][0]).toHaveLength(2)
  })
})

describe('paste is actually WIRED to the DM composer', () => {
  // The unit tests above prove the gate. These prove the handler is on the
  // textarea at all — the failure a pure test cannot see.
  it('a pasted screenshot lands in the tray', async () => {
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    const box = screen.getByLabelText('Message')
    fireEvent(box, clipboard({ files: [img('image.png', 'image/png')] }))
    expect(await screen.findAllByTestId('tray-thumb')).toHaveLength(1)
  })

  it('a pasted Excel workbook lands on the pending-file chip', async () => {
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    const box = screen.getByLabelText('Message')
    fireEvent(
      box,
      clipboard({
        files: [
          new File(['x'], 'fixture-list.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
      }),
    )
    expect(await screen.findByTestId('pending-file')).toHaveTextContent('fixture-list.xlsx')
    expect(screen.queryAllByTestId('tray-thumb')).toHaveLength(0)
  })

  it('⚠️ typing-paste still works: nothing prevented, nothing attached', async () => {
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    const box = screen.getByLabelText('Message')
    const ev = clipboard({ text: 'see you Saturday' })
    fireEvent(box, ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryAllByTestId('tray-thumb')).toHaveLength(0)
  })
})
