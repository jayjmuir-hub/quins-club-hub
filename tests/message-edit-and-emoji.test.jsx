import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Two chat features of 30 Aug 2026, both living in the SHARED components so
// every surface (channels, replies, DMs, groups, the dock) gets them at once:
//
//   EDIT — the author's own message, offered only inside the 15-minute window
//   (canStillEdit is the client hint; private.touch_message is the rule).
//   Saves in place, and the bubble already wore the "(edited)" tag.
//
//   BIG EMOJI — an emoji-only message (1–3 pictographic glyphs) renders large,
//   WhatsApp's rule. Grapheme clusters, not code points, so skin tones and
//   family ZWJ sequences count as one glyph.

import { emojiOnlyCount } from '../src/components/ChatBubble.jsx'
import { canStillEdit } from '../src/lib/messageEdit.js'
import ChatBubble from '../src/components/ChatBubble.jsx'
import MessageEditor from '../src/components/MessageEditor.jsx'
import MessageRow from '../src/components/MessageRow.jsx'

describe('emojiOnlyCount', () => {
  it('counts 1–3 pure-emoji glyphs', () => {
    expect(emojiOnlyCount('👍')).toBe(1)
    expect(emojiOnlyCount('👍 🎉')).toBe(2)
    expect(emojiOnlyCount('👍🎉🔥')).toBe(3)
  })

  it('⚠️ a skin tone or a family is ONE glyph, not several', () => {
    expect(emojiOnlyCount('👍🏽')).toBe(1)
    expect(emojiOnlyCount('👨‍👩‍👧')).toBe(1)
  })

  it('anything with text stays text-sized — including digits, which ARE Emoji in Unicode', () => {
    expect(emojiOnlyCount('nice 👍')).toBe(0)
    expect(emojiOnlyCount('3')).toBe(0)
    expect(emojiOnlyCount('#')).toBe(0)
    expect(emojiOnlyCount('')).toBe(0)
    expect(emojiOnlyCount(null)).toBe(0)
  })

  it('four emoji read as a message, not a gesture', () => {
    expect(emojiOnlyCount('👍🎉🔥😀')).toBe(0)
  })
})

describe('ChatBubble — big emoji rendering', () => {
  it('an emoji-only bubble is marked and sized up', () => {
    render(<ChatBubble mine={false} messageId="m1" testId="bubble" body="👍" createdAt="2026-08-30T10:00:00Z" />)
    const p = screen.getByText('👍').closest('p')
    expect(p).toHaveAttribute('data-emoji-only', 'true')
    expect(p.className).toContain('text-[44px]')
  })

  it('a caption on a photo stays body-sized — the emoji annotates the picture', () => {
    render(
      <ChatBubble mine={false} messageId="m2" testId="bubble" body="👍" photoPath="p/x.jpg" createdAt="2026-08-30T10:00:00Z" />,
    )
    const p = screen.getByText('👍').closest('p')
    expect(p).not.toHaveAttribute('data-emoji-only')
  })

  it('prose keeps prose size', () => {
    render(<ChatBubble mine testId="bubble" messageId="m3" body="See you at six 👍" createdAt="2026-08-30T10:00:00Z" />)
    const p = screen.getByText(/See you at six/).closest('p')
    expect(p).not.toHaveAttribute('data-emoji-only')
    expect(p.className).toContain('text-[14.5px]')
  })
})

describe('canStillEdit', () => {
  const NOW = new Date('2026-08-30T12:00:00Z')
  it('true inside the 15-minute window, false after it', () => {
    expect(canStillEdit({ created_at: '2026-08-30T11:50:00Z' }, NOW)).toBe(true)
    expect(canStillEdit({ created_at: '2026-08-30T11:44:00Z' }, NOW)).toBe(false)
  })
  it('never for a removed message, or garbage', () => {
    expect(canStillEdit({ created_at: '2026-08-30T11:59:00Z', deleted_at: '2026-08-30T11:59:30Z' }, NOW)).toBe(false)
    expect(canStillEdit(null, NOW)).toBe(false)
    expect(canStillEdit({ created_at: 'not-a-date' }, NOW)).toBe(false)
  })
})

describe('MessageEditor', () => {
  it('saves the trimmed draft and only when it changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    render(<MessageEditor body="Training at six" onSave={onSave} onCancel={onCancel} />)
    const box = screen.getByLabelText('Edit message')
    await userEvent.clear(box)
    await userEvent.type(box, 'Training at seven')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('Training at seven')
  })

  it('an unchanged save is a cancel, not a write', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<MessageEditor body="Training at six" onSave={onSave} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('a refusal renders in the database’s words, and the editor stays open', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('a message can be edited for 15 minutes'))
    render(<MessageEditor body="old" onSave={onSave} onCancel={vi.fn()} />)
    const box = screen.getByLabelText('Edit message')
    await userEvent.clear(box)
    await userEvent.type(box, 'new words')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/15 minutes/)
    expect(screen.getByTestId('message-editor')).toBeInTheDocument()
  })
})

describe('MessageRow — the Edit door', () => {
  const fresh = (overrides = {}) => ({
    id: 'msg-1',
    author_id: 'me',
    author_role: 'coach',
    body: 'Training moves to pitch 3.',
    pinned: false,
    edited_at: null,
    deleted_at: null,
    created_at: new Date(Date.now() - 60 * 1000).toISOString(), // a minute ago
    author: { full_name: 'Zz Probe Coach' },
    replies: [],
    ...overrides,
  })

  beforeEach(() => vi.clearAllMocks())

  async function openMenu() {
    await userEvent.click(screen.getByRole('button', { name: 'Message options' }))
  }

  it('offers Edit on my own fresh message, edits in place, and saves', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    render(<MessageRow message={fresh()} selfId="me" onEdit={onEdit} onRemove={vi.fn()} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const box = screen.getByLabelText('Edit message')
    expect(box).toHaveValue('Training moves to pitch 3.')
    await userEvent.clear(box)
    await userEvent.type(box, 'Training moves to pitch 4.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith('msg-1', 'Training moves to pitch 4.')
  })

  it('no Edit on somebody else’s message, however fresh', async () => {
    render(<MessageRow message={fresh({ author_id: 'them' })} selfId="me" onEdit={vi.fn()} onRemove={vi.fn()} onReport={vi.fn()} />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
  })

  it('no Edit once the 15-minute window is gone — the database would refuse it anyway', async () => {
    const old = fresh({ created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() })
    render(<MessageRow message={old} selfId="me" onEdit={vi.fn()} onRemove={vi.fn()} />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
  })
})

// A reply's author deserves the same private door a post's author has — the
// nested bubbles were the one surface without it (Jay, 30 Aug 2026).
describe('MessageRow — Reply privately on a nested reply', () => {
  it('offers it on someone else’s reply and hands over THAT reply', async () => {
    const theirReply = {
      id: 'r-1',
      author_id: 'them',
      author_role: 'parent',
      body: 'Can someone bring cones?',
      deleted_at: null,
      created_at: '2026-08-30T10:01:00Z',
      author: { full_name: 'Zz Probe Parent' },
    }
    const message = {
      id: 'msg-1',
      author_id: 'me',
      author_role: 'coach',
      body: 'Training moves to pitch 3.',
      pinned: false,
      deleted_at: null,
      created_at: '2026-08-30T10:00:00Z',
      author: { full_name: 'Me' },
    }
    const onReplyPrivately = vi.fn()
    // Flat stream since 4 Sep 2026: the reply is its own row under the post.
    render(
      <>
        <MessageRow message={message} selfId="me" onRemove={vi.fn()} onReplyPrivately={onReplyPrivately} />
        <MessageRow message={{ ...theirReply, parent_id: message.id, parent: message }} selfId="me" onRemove={vi.fn()} onReplyPrivately={onReplyPrivately} />
      </>,
    )
    // Two chevrons: the post's and the reply's. The reply's is the second.
    const menus = await screen.findAllByRole('button', { name: 'Message options' })
    await userEvent.click(menus[1])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reply privately' }))
    // The row hands over the reply as it holds it — with its parent link.
    expect(onReplyPrivately).toHaveBeenCalledWith(expect.objectContaining({ id: theirReply.id, author_id: theirReply.author_id }))
  })

  it('never on my own reply — there is nobody to go private with', async () => {
    const mineReply = {
      id: 'r-2',
      author_id: 'me',
      author_role: 'coach',
      body: 'I will.',
      deleted_at: null,
      created_at: new Date(Date.now() - 60 * 1000).toISOString(),
      author: { full_name: 'Me' },
    }
    const message = {
      id: 'msg-2',
      author_id: 'them',
      author_role: 'coach',
      body: 'Anyone free Saturday?',
      pinned: false,
      deleted_at: null,
      created_at: '2026-08-30T10:00:00Z',
      author: { full_name: 'Them' },
    }
    render(
      <>
        <MessageRow message={message} selfId="me" onRemove={vi.fn()} onEdit={vi.fn()} onReplyPrivately={vi.fn()} />
        <MessageRow message={{ ...mineReply, parent_id: message.id, parent: message }} selfId="me" onRemove={vi.fn()} onEdit={vi.fn()} onReplyPrivately={vi.fn()} />
      </>,
    )
    const menus = await screen.findAllByRole('button', { name: 'Message options' })
    await userEvent.click(menus[1])
    expect(screen.queryByRole('menuitem', { name: 'Reply privately' })).toBeNull()
    // Own fresh reply still edits — the two doors coexist correctly.
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
  })
})
