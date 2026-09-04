import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// 25 Aug 2026, Jay: "you should be able to reply privately to anyone chatting
// in a group, also click on any username … and have the option to chat with
// them." The GROUP half already existed on the DM thread
// (tests/chat-round-4-thread.test.jsx); this file proves the shared shell
// carries both courtesies into the CHANNEL stream — MessageRow with pure
// props, same approach as tests/chat-round-2-channel.test.jsx.
//
// ⚠️ EVERY NAME IS INVENTED (CLAUDE.md rule 9).
//
// Whether a DM is ALLOWED is open_conversation's call in the database — the
// screens just relay its refusal — so what a component test can honestly
// prove is the offer: present on someone else's message, absent on your own.

const media = { signChatPhotoUrl: vi.fn() }
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: (...a) => media.signChatPhotoUrl(...a),
  isAudioAttachment: (p) => /\.(webm|m4a|mp4|aac|mp3|ogg)$/i.test(p || ''),
  isFileAttachment: (p) => /\.(pdf|doc|docx|xls|xlsx|csv)$/i.test(p || ''),
  messageAttachmentLabel: () => '📷 Photo',
  chatFileAccept: () => 'application/pdf',
  uploadChatFile: vi.fn(),
  attachmentPreviewLabel: () => '📷 Photo',
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
}))

import MessageRow from '../src/components/MessageRow.jsx'

const BASE = {
  id: 'msg-1',
  author_id: 'coach-1',
  author_role: 'coach',
  author: { full_name: 'Zz Coach Probe' },
  body: 'Training moved to 5pm',
  created_at: '2026-08-24T08:00:00Z',
  deleted_at: null,
  pinned: false,
  forwarded: false,
  attachment_path: null,
  replies: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reply privately, from the channel', () => {
  it("offers it on someone else's message and hands over the whole message", async () => {
    const user = userEvent.setup()
    const onReplyPrivately = vi.fn()
    render(
      <MessageRow message={BASE} selfId="me-1" onReplyPrivately={onReplyPrivately} />,
    )
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply privately' }))
    expect(onReplyPrivately).toHaveBeenCalledWith(BASE)
  })

  it('never offers it on your own message — there is nobody to DM', async () => {
    const user = userEvent.setup()
    render(
      <MessageRow
        message={{ ...BASE, author_id: 'me-1' }}
        selfId="me-1"
        onReplyPrivately={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    expect(screen.queryByRole('menuitem', { name: 'Reply privately' })).toBeNull()
  })

  it('says nothing when the screen offers no handler', async () => {
    const user = userEvent.setup()
    render(<MessageRow message={BASE} selfId="me-1" onReport={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    expect(screen.queryByRole('menuitem', { name: 'Reply privately' })).toBeNull()
  })
})

describe('the author name opens a chat', () => {
  it('is a button carrying the author id, on message AND reply', async () => {
    const user = userEvent.setup()
    const onAuthor = vi.fn()
    // Flat stream since 4 Sep 2026: a reply is its own row, wearing a quote.
    const reply = {
      ...BASE,
      id: 'r-1',
      parent_id: BASE.id,
      parent: BASE,
      author_id: 'parent-2',
      author_role: 'parent',
      author: { full_name: 'Zz Parent Probe' },
      body: 'Noted, thanks',
      created_at: '2026-08-24T08:05:00Z',
    }
    render(
      <>
        <MessageRow message={BASE} selfId="me-1" onAuthor={onAuthor} />
        <MessageRow message={reply} selfId="me-1" onAuthor={onAuthor} />
      </>,
    )
    const buttons = screen.getAllByTestId('author-chat')
    expect(buttons).toHaveLength(2)
    await user.click(buttons[0])
    expect(onAuthor).toHaveBeenCalledWith('coach-1')
    await user.click(buttons[1])
    expect(onAuthor).toHaveBeenCalledWith('parent-2')
  })

  it('stays plain text without a handler — no dead button', () => {
    render(<MessageRow message={BASE} selfId="me-1" />)
    expect(screen.queryByTestId('author-chat')).toBeNull()
    expect(screen.getByText('Zz Coach Probe')).toBeInTheDocument()
  })
})
