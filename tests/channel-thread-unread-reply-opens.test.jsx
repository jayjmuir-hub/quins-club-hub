import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// 4 Sep 2026: a manager answered a post with REPLY, and the chat list's
// preview (my_chats takes the newest message, reply or not) showed it while
// the thread hid it behind a folded "1 reply" link under the second-to-last
// bubble. Jay's report: "entering that chat group and the message isn't
// there". The fix: a post whose thread holds a reply the reader has not
// seen opens on arrival, so the message the list promised is on screen.
//
// The control cases DISCRIMINATE: a thread whose only reply was already
// read stays folded, and so does one whose reply is the reader's own.

vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/profileIcons.js', () => ({
  listClubIconMap: async () => new Map(),
  listMemberIcons: async () => [],
}))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: async () => 'blob:signed',
  isAudioAttachment: () => false,
  attachmentPreviewLabel: () => '📷 Photo',
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
}))
vi.mock('../src/components/VoiceComposer.jsx', () => ({ default: () => null }))

import ChannelThread from '../src/components/ChannelThread.jsx'

const ME = 'me-1'
const OTHER = 'zz-manager-probe'

function post(id, body, replies = []) {
  return {
    id,
    author_id: OTHER,
    author_role: 'manager',
    author: { full_name: 'Zz Manager Probe' },
    body,
    created_at: '2026-09-03T16:45:00Z',
    deleted_at: null,
    pinned: false,
    forwarded: false,
    attachment_path: null,
    replies,
  }
}

function reply(id, body, authorId = OTHER) {
  return { ...post(id, body), author_id: authorId, parent_id: 'ignored', replies: undefined }
}

function stubThread(messages, readIds) {
  const reads = new Set(readIds)
  return {
    selfId: ME,
    isClub: false,
    staffChannel: false,
    canModerate: false,
    messages,
    reads,
    openReadsRef: { current: reads },
    newFromRef: { current: null },
    stats: new Map(),
    announceOnly: false,
    mayPost: true,
    pinned: [],
    attachable: [],
    attachedEvent: null,
    error: null,
    sendError: null,
    tallies: new Map(),
    reactions: new Map(),
    mentionables: [],
    background: 'none',
    tray: { items: [], add: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    polls: new Map(),
    draft: '',
    setDraft: vi.fn(),
    setDraftMentions: vi.fn(),
    draftRef: { current: null },
    fileRef: { current: null },
    composerOpen: true,
    sending: false,
    progress: null,
    send: vi.fn(),
    sendVoice: vi.fn(),
    sendPoll: vi.fn(),
    postingPoll: false,
    allowPolls: false,
    attachEventId: '',
    setAttachEventId: vi.fn(),
    setSendError: vi.fn(),
    pickPhoto: vi.fn(),
    md: false,
    onReact: vi.fn(),
    onReply: vi.fn(),
    onRemove: vi.fn(),
    onEdit: vi.fn(),
    onPin: vi.fn(),
    onReport: vi.fn(),
    onReplyPrivately: vi.fn(),
    openDmWith: vi.fn(),
    vote: vi.fn(),
  }
}

function renderThread(thread) {
  return render(
    <MemoryRouter>
      <ChannelThread thread={thread} />
    </MemoryRouter>,
  )
}

describe('ChannelThread — a thread holding an unread reply opens on arrival', () => {
  it('shows the unread reply without a tap, under the post it answers', () => {
    const messages = [
      post('p-1', 'Please send me your list', [reply('r-1', 'Including those who need training?')]),
      post('p-2', '@everyone'),
    ]
    renderThread(stubThread(messages, ['p-1', 'p-2']))
    expect(screen.getByText('Including those who need training?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 reply' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('CONTROL: a reply already read stays folded', () => {
    const messages = [post('p-1', 'Please send me your list', [reply('r-1', 'Seen this one already')]), post('p-2', '@everyone')]
    renderThread(stubThread(messages, ['p-1', 'p-2', 'r-1']))
    expect(screen.queryByText('Seen this one already')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 reply' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('CONTROL: my own reply stays folded — I wrote it', () => {
    const messages = [post('p-1', 'Please send me your list', [reply('r-1', 'My own answer', ME)]), post('p-2', '@everyone')]
    renderThread(stubThread(messages, ['p-1', 'p-2']))
    expect(screen.queryByText('My own answer')).not.toBeInTheDocument()
  })

  it('CONTROL: a deleted unread reply does not open the thread', () => {
    const gone = { ...reply('r-1', 'Removed words'), deleted_at: '2026-09-04T01:00:00Z' }
    const messages = [post('p-1', 'Please send me your list', [gone]), post('p-2', '@everyone')]
    renderThread(stubThread(messages, ['p-1', 'p-2']))
    expect(screen.getByRole('button', { name: '1 reply' })).toHaveAttribute('aria-expanded', 'false')
  })
})
