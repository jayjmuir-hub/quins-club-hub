import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Chat file composer: a separate door beside the photo tray. A PDF must not
// enter useAttachmentTray; send writes attachments jsonb only.

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
  uploadChatFile: vi.fn(),
  removeChatPhoto: vi.fn(),
  signChatPhotoUrl: vi.fn(),
}
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/chatPrefs.js', () => ({
  getMyChatPref: async () => null,
  setChatPref: async () => {},
  listMyChatPrefs: async () => new Map(),
}))
vi.mock('../src/lib/presence.js', () => ({
  usePresence: () => new Map(),
  dotState: (map, id) => (id && map?.get?.(id)) || 'offline',
}))
vi.mock('../src/data/messages.js', () => ({
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
  uploadChatFile: (...a) => media.uploadChatFile(...a),
  removeChatPhoto: (...a) => media.removeChatPhoto(...a),
  removeChatAttachments: vi.fn(),
  signChatPhotoUrl: (...a) => media.signChatPhotoUrl(...a),
  isAudioAttachment: (p) => /\.(webm|m4a|mp4|aac|mp3|ogg)$/i.test(p || ''),
  isFileAttachment: (p) => /\.(pdf|doc|docx|xls|xlsx|csv)$/i.test(p || ''),
  messageAttachmentLabel: (msg) => (msg?.attachments?.[0]?.name ? `📄 ${msg.attachments[0].name}` : '📄 File'),
  chatFileAccept: () =>
    'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/csv',
  attachmentPreviewLabel: () => '📷 Photo',
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
  quoted: extra.quoted ?? null,
  forwarded: false,
  attachment_path: extra.attachment_path ?? null,
  attachments: extra.attachments ?? [],
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
  media.uploadChatFile.mockResolvedValue({
    file: `${ME}/uuid.xlsx`,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1,
    name: 'grid.xlsx',
  })
  media.signChatPhotoUrl.mockResolvedValue('blob:signed')
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

const xlsx = () =>
  new File(['x'], 'grid.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
const ppt = () => new File(['x'], 'slides.ppt', { type: 'application/vnd.ms-powerpoint' })

describe('chat file composer', () => {
  it('has a file control in the + menu, not multiple, beside the photo input', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    expect(screen.getByTestId('file-input')).not.toHaveAttribute('multiple')
    expect(screen.getByTestId('photo-input')).toHaveAttribute('multiple')
    expect(screen.queryByTestId('file-button')).toBeNull()
    await user.click(screen.getByTestId('attach-menu'))
    expect(screen.getByRole('menuitem', { name: 'Attach a file' })).toBeTruthy()
  })

  it('refuses ppt and does not put it in the photo tray', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [ppt()] } })
    expect(screen.getByTestId('file-error')).toHaveTextContent(/not supported/i)
    expect(screen.queryByTestId('pending-file')).toBeNull()
    expect(screen.queryAllByTestId('tray-thumb')).toHaveLength(0)
  })

  it('sends attachments jsonb only — one file, no photo mix', async () => {
    const user = userEvent.setup()
    renderThread()
    await screen.findAllByTestId('dm-bubble')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [xlsx()] } })
    expect(screen.getByTestId('pending-file')).toHaveTextContent('grid.xlsx')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(m.sendDirectMessage).toHaveBeenCalledTimes(1))
    expect(media.uploadChatFile).toHaveBeenCalledTimes(1)
    expect(media.uploadChatPhoto).not.toHaveBeenCalled()
    const [, body, opts] = m.sendDirectMessage.mock.calls[0]
    expect(body).toBe('')
    expect(opts).toEqual({
      quotedId: null,
      mentions: [],
      attachments: [
        {
          file: `${ME}/uuid.xlsx`,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 1,
          name: 'grid.xlsx',
        },
      ],
    })
    expect(opts).not.toHaveProperty('attachment_path')
    expect(opts).not.toHaveProperty('attachment_paths')
  })
})
