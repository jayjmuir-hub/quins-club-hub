import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Round 2 in the CHANNEL stream: MessageRow (pure props, harness-rendered)
// wears the Forwarded tag and renders a photo from its signed URL, and a
// photo-only message shows no empty paragraph. The composer's upload path
// is proven on the DM thread (tests/chat-round-2-thread.test.jsx) — the
// channel composer shares the same helpers and the same order.
//
// 25 Aug 2026: the same file now also wears the DM Thread's bubble language
// (round 3/4) — Jay's production screenshot of U11 Mixed · staff still had
// the old rectangular bubbles, "You", avatars, and under-bubble action
// links. DirectMessages was already chrome-free (bc971f8 / #389).

const media = { signChatPhotoUrl: vi.fn() }
// The DM header identity line fetches the person card (26 Aug 2026);
// null here keeps this file about its own subject and network-free.
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: (...a) => media.signChatPhotoUrl(...a),
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
  media.signChatPhotoUrl.mockResolvedValue('blob:signed')
})

describe('MessageRow — round 2', () => {
  it('a forwarded post wears the tag', () => {
    render(<MessageRow message={{ ...BASE, forwarded: true }} selfId="me-1" />)
    expect(screen.getByTestId('forwarded-tag')).toHaveTextContent('Forwarded')
  })

  it('a photo post renders the image from a signed URL, above its text', async () => {
    render(<MessageRow message={{ ...BASE, attachment_path: 'coach-1/pic.jpg' }} selfId="me-1" />)
    const photo = await screen.findByTestId('chat-photo')
    expect(media.signChatPhotoUrl).toHaveBeenCalledWith('coach-1/pic.jpg')
    expect(within(photo).getByRole('img')).toHaveAttribute('src', 'blob:signed')
    expect(screen.getByText('Training moved to 5pm')).toBeInTheDocument()
  })

  it('a photo-only post renders no empty paragraph, and a plain post no tag', async () => {
    const { container, rerender } = render(
      <MessageRow message={{ ...BASE, body: '', attachment_path: 'coach-1/pic.jpg' }} selfId="me-1" />,
    )
    await screen.findByTestId('chat-photo')
    expect(container.querySelector('p.whitespace-pre-wrap')).toBeNull()

    rerender(<MessageRow message={BASE} selfId="me-1" />)
    expect(screen.queryByTestId('forwarded-tag')).not.toBeInTheDocument()
    expect(screen.queryByTestId('chat-photo')).not.toBeInTheDocument()
  })
})

describe('MessageRow — DM bubble language (25 Aug 2026)', () => {
  // Same assertions as tests/chat-round-3.test.jsx against DirectMessages
  // Thread. A channel post must not invent a third style.
  const noop = async () => {}

  it('own bubbles are quins green with the stamp INSIDE, and no You label', () => {
    render(
      <MessageRow
        message={{ ...BASE, author_id: 'me-1', author_role: 'parent', author: { full_name: 'Zz Parent Probe' } }}
        selfId="me-1"
        onReply={noop}
        onRemove={noop}
      />,
    )
    const row = screen.getByTestId('message-row')
    expect(row).toHaveAttribute('data-mine', 'true')
    const bubble = row.querySelector('[class*="bg-accent-deep"]')
    expect(bubble).not.toBeNull()
    expect(within(row).getByText('Training moved to 5pm').textContent).toMatch(/Training moved to 5pm/)
    expect(within(row).queryByText('You')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('theirs wear the author name (and staff pill), never an avatar', () => {
    render(
      <MessageRow
        message={{ ...BASE, author_title: 'Head Coach' }}
        selfId="me-1"
        onReply={noop}
        onReport={noop}
      />,
    )
    const row = screen.getByTestId('message-row')
    expect(row).toHaveAttribute('data-staff', 'true')
    expect(within(row).getByText('Zz Coach Probe')).toBeInTheDocument()
    expect(within(row).getByText('Head Coach')).toBeInTheDocument()
    expect(row.innerHTML).not.toMatch(/bg-monogram/)
  })

  it('actions live in the chevron — Reply / Pin / Delete / Report are menuitems, not a row under the bubble', async () => {
    const user = userEvent.setup()
    const onPin = vi.fn()
    const onRemove = vi.fn()
    const onReport = vi.fn()
    render(
      <MessageRow
        message={BASE}
        selfId="me-1"
        canModerate
        onReply={noop}
        onPin={onPin}
        onRemove={onRemove}
        onReport={onReport}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    expect(screen.getByRole('menuitem', { name: 'Reply' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument()
  })

  it('the reaction trigger sits BESIDE the bubble — right of theirs, left of mine', () => {
    const onReact = vi.fn()
    const { rerender } = render(<MessageRow message={BASE} selfId="me-1" onReact={onReact} />)
    const theirs = screen.getByTestId('message-bubble')
    expect(theirs.lastElementChild).toBe(within(theirs).getByTestId('reaction-trigger'))

    rerender(
      <MessageRow
        message={{ ...BASE, author_id: 'me-1' }}
        selfId="me-1"
        onReact={onReact}
      />,
    )
    const mine = screen.getByTestId('message-bubble')
    expect(mine.firstElementChild).toBe(within(mine).getByTestId('reaction-trigger'))
  })

  it('tallies overlap the bubble corner as a pill, not a bar inside it', () => {
    const reactions = new Map([
      ['msg-1', [{ message_id: 'msg-1', profile_id: 'me-1', emoji: '👍' }]],
    ])
    render(<MessageRow message={BASE} selfId="me-1" reactions={reactions} onReact={vi.fn()} />)
    const pill = screen.getByTestId('reaction-pill')
    expect(pill.className).toMatch(/absolute/)
    expect(pill.className).toMatch(/-bottom-3/)
    expect(within(pill).getByTestId('reaction-bar')).toBeInTheDocument()
  })
})

